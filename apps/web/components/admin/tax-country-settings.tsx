"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@teculiar/web-core/components/layout/locale-provider";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import { countriesForLocale } from "@teculiar/web-core/lib/countries";

export type TaxCountriesValue = { enabled: boolean; default: string; rates: Record<string, number> };

type Props = {
  value: TaxCountriesValue;
  onChange: (value: TaxCountriesValue) => void;
};

const muted: React.CSSProperties = { color: "var(--muted)", fontSize: "0.84rem", margin: "-4px 0 4px" };
const chipRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const removeBtn: React.CSSProperties = { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: 0 };

export function TaxCountrySettings({ value, onChange }: Props) {
  const c = getDictionary(useLocale()).admin.tax;
  const allCountries = useMemo(() => countriesForLocale("en"), []);
  const nameFor = (code: string) => allCountries.find((c) => c.code === code) ?? { code, name: code, flag: "" };
  const codes = Object.keys(value.rates).sort((a, b) => nameFor(a).name.localeCompare(nameFor(b).name));
  const options = useMemo(
    () => allCountries.map((c) => ({ code: c.code, label: `${c.flag} ${c.name} (${c.code})` })),
    [allCountries]
  );

  function setDefault(code: string) {
    const rates = { ...value.rates };
    if (typeof rates[code] !== "number") {
      rates[code] = 19;
    }
    onChange({ ...value, default: code, rates });
  }
  function setRate(code: string, rate: number) {
    onChange({ ...value, rates: { ...value.rates, [code]: rate } });
  }
  function addCountry(code: string) {
    if (!code || code in value.rates) return;
    onChange({ ...value, rates: { ...value.rates, [code]: 19 } });
  }
  function removeCountry(code: string) {
    if (code === value.default) return; // the default country must always keep a rate
    const rates = { ...value.rates };
    delete rates[code];
    onChange({ ...value, rates });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h3>{c.heading}</h3>
      <p style={muted}>{c.hint}</p>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} style={{ width: "auto" }} />
        {c.chargeVat}
      </label>
      {!value.enabled && <p style={muted}>{c.vatOff}</p>}
      <fieldset disabled={!value.enabled} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 14, opacity: value.enabled ? 1 : 0.5 }}>
      <label>
        {c.defaultCountry}
        <select value={value.default} onChange={(e) => setDefault(e.target.value)}>
          {codes.map((code) => (
            <option key={code} value={code}>{nameFor(code).flag} {nameFor(code).name} ({code})</option>
          ))}
        </select>
      </label>
      <div>
        <div style={{ fontSize: "0.84rem", color: "var(--muted)", marginBottom: 6 }}>{c.countryRates}</div>
        {codes.map((code) => (
          <div key={code} style={{ ...chipRow, justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", marginBottom: 8 }}>
            <strong>{nameFor(code).flag} {nameFor(code).name} ({code}){code === value.default ? c.defaultSuffix : ""}</strong>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={value.rates[code]}
                onChange={(e) => setRate(code, Math.max(0, Number(e.target.value)))}
                style={{ width: 90 }}
              />
              <span style={{ color: "var(--muted)" }}>%</span>
              {code === value.default ? null : (
                <button type="button" style={removeBtn} aria-label={c.removeAria.replace("{code}", code)} onClick={() => removeCountry(code)}>×</button>
              )}
            </span>
          </div>
        ))}
        <CountryTypeahead placeholder={c.addCountry} options={options} exclude={codes} onPick={addCountry} />
      </div>
      </fieldset>
    </div>
  );
}

function CountryTypeahead({ placeholder, options, exclude, onPick }: { placeholder: string; options: Array<{ code: string; label: string }>; exclude: string[]; onPick: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return options.filter((o) => !exclude.includes(o.code) && o.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, options, exclude]);

  return (
    <div style={{ position: "relative", marginTop: 8, maxWidth: 420 }}>
      <input value={query} placeholder={placeholder} onChange={(e) => setQuery(e.target.value)} />
      {matches.length > 0 && (
        <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, background: "var(--surface, #fff)", border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, overflow: "hidden", boxShadow: "0 6px 20px rgba(0,0,0,0.12)" }}>
          {matches.map((m) => (
            <button
              key={m.code}
              type="button"
              onClick={() => { onPick(m.code); setQuery(""); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
