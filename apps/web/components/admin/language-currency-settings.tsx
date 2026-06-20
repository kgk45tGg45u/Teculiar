"use client";

import { useMemo, useState } from "react";
import {
  currencyCatalog,
  currencyName,
  currencySymbol,
  languageCatalog,
  languageFlag,
  languageName
} from "../../lib/i18n-catalog";

export type LanguagesValue = { main: string; others: string[] };
export type CurrencyRate = { rate: number; buffer: number; bufferEnabled: boolean };
export type CurrencyConfigValue = { main: string; others: string[]; rates: Record<string, CurrencyRate> };

type Props = {
  languages: LanguagesValue;
  currencyConfig: CurrencyConfigValue;
  onLanguages: (value: LanguagesValue) => void;
  onCurrencyConfig: (value: CurrencyConfigValue) => void;
};

const muted: React.CSSProperties = { color: "var(--muted)", fontSize: "0.84rem", margin: "-4px 0 4px" };
const chipRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const chip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", fontSize: "0.9rem" };
const removeBtn: React.CSSProperties = { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: 0 };

export function LanguageCurrencySettings({ languages, currencyConfig, onLanguages, onCurrencyConfig }: Props) {
  const langCodes = [languages.main, ...languages.others];
  const curCodes = [currencyConfig.main, ...currencyConfig.others];
  const languageOptions = useMemo(() => languageCatalog().map((l) => ({ code: l.code, label: `${l.flag} ${l.name} — ${l.nativeName} (${l.code})` })), []);
  const currencyOptions = useMemo(() => currencyCatalog().map((c) => ({ code: c.code, label: `${c.symbol} ${c.code} — ${c.name}` })), []);

  // ── Languages ──
  function setMainLanguage(code: string) {
    if (code === languages.main) return;
    const others = [languages.main, ...languages.others].filter((c) => c !== code);
    onLanguages({ main: code, others });
  }
  function addLanguage(code: string) {
    if (langCodes.includes(code)) return;
    onLanguages({ ...languages, others: [...languages.others, code] });
  }
  function removeLanguage(code: string) {
    onLanguages({ ...languages, others: languages.others.filter((c) => c !== code) });
  }

  // ── Currencies ──
  function setMainCurrency(code: string) {
    if (code === currencyConfig.main) return;
    const others = [currencyConfig.main, ...currencyConfig.others].filter((c) => c !== code);
    const rates = { ...currencyConfig.rates };
    delete rates[code]; // new main needs no rate
    if (!rates[currencyConfig.main]) {
      rates[currencyConfig.main] = { rate: 1, buffer: 0, bufferEnabled: false }; // old main becomes convertible
    }
    onCurrencyConfig({ main: code, others, rates });
  }
  function addCurrency(code: string) {
    if (curCodes.includes(code)) return;
    onCurrencyConfig({
      ...currencyConfig,
      others: [...currencyConfig.others, code],
      rates: { ...currencyConfig.rates, [code]: { rate: 1, buffer: 0, bufferEnabled: false } }
    });
  }
  function removeCurrency(code: string) {
    const rates = { ...currencyConfig.rates };
    delete rates[code];
    onCurrencyConfig({ ...currencyConfig, others: currencyConfig.others.filter((c) => c !== code), rates });
  }
  function setRate(code: string, patch: Partial<CurrencyRate>) {
    const current = currencyConfig.rates[code] ?? { rate: 1, buffer: 0, bufferEnabled: false };
    onCurrencyConfig({ ...currencyConfig, rates: { ...currencyConfig.rates, [code]: { ...current, ...patch } } });
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <h3>Languages</h3>
      <p style={muted}>The main language is the default; English always backfills any missing translation. With a single language the visitor toggle hides the language selector.</p>
      <label>
        Main language
        <select value={languages.main} onChange={(e) => setMainLanguage(e.target.value)}>
          {langCodes.map((code) => <option key={code} value={code}>{languageFlag(code)} {languageName(code)} ({code})</option>)}
        </select>
      </label>
      <div>
        <div style={{ fontSize: "0.84rem", color: "var(--muted)", marginBottom: 6 }}>Other languages</div>
        <div style={chipRow}>
          {languages.others.length === 0 && <span style={muted}>None — only the main language is offered.</span>}
          {languages.others.map((code) => (
            <span key={code} style={chip}>
              {languageFlag(code)} {languageName(code)} ({code})
              <button type="button" style={removeBtn} aria-label={`Remove ${code}`} onClick={() => removeLanguage(code)}>×</button>
            </span>
          ))}
        </div>
        <Typeahead
          placeholder="Add a language pack…"
          exclude={langCodes}
          options={languageOptions}
          onPick={addLanguage}
        />
      </div>

      <h3>Currency</h3>
      <p style={muted}>Prices are stored in the main currency. Other currencies convert at display time using the rate (and optional buffer) below. With a single currency the toggle hides the currency selector.</p>
      <label>
        Main currency
        <select value={currencyConfig.main} onChange={(e) => setMainCurrency(e.target.value)}>
          {curCodes.map((code) => <option key={code} value={code}>{currencySymbol(code)} {code} — {currencyName(code)}</option>)}
        </select>
      </label>
      <div>
        <div style={{ fontSize: "0.84rem", color: "var(--muted)", marginBottom: 6 }}>Other currencies &amp; exchange rates</div>
        {currencyConfig.others.length === 0 && <span style={muted}>None — only the main currency is offered.</span>}
        {currencyConfig.others.map((code) => {
          const rate = currencyConfig.rates[code] ?? { rate: 1, buffer: 0, bufferEnabled: false };
          return (
            <div key={code} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10, display: "grid", gap: 8 }}>
              <div style={{ ...chipRow, justifyContent: "space-between" }}>
                <strong>{currencySymbol(code)} {code} — {currencyName(code)}</strong>
                <button type="button" style={removeBtn} aria-label={`Remove ${code}`} onClick={() => removeCurrency(code)}>×</button>
              </div>
              <label>
                Exchange rate (1 {currencyConfig.main} = ? {code})
                <input type="number" min="0.0001" step="0.0001" value={rate.rate} onChange={(e) => setRate(code, { rate: Number(e.target.value) })} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={rate.bufferEnabled} onChange={(e) => setRate(code, { bufferEnabled: e.target.checked })} style={{ width: "auto" }} />
                Add an equivalent amount to every converted price
              </label>
              {rate.bufferEnabled && (
                <label>
                  Amount to add (in {code})
                  <input type="number" min="0" step="0.01" value={(rate.buffer / 100).toFixed(2)} onChange={(e) => setRate(code, { buffer: Math.round(Number(e.target.value) * 100) })} />
                </label>
              )}
            </div>
          );
        })}
        <Typeahead
          placeholder="Add a currency…"
          exclude={curCodes}
          options={currencyOptions}
          onPick={addCurrency}
        />
      </div>
    </div>
  );
}

function Typeahead({ placeholder, options, exclude, onPick }: { placeholder: string; options: Array<{ code: string; label: string }>; exclude: string[]; onPick: (code: string) => void }) {
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
