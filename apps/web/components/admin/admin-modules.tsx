"use client";

import { Eye, EyeOff, RefreshCw, Save, Settings, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, money, type ApiDomainPrice, type ApiModule } from "@teculiar/web-core/lib/api";
import { surfaceHref } from "@teculiar/web-core/lib/surface";
import { useLocale } from "@teculiar/web-core/components/layout/locale-provider";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import { Button } from "@teculiar/web-core/components/ui/button";
import { StatusPill } from "@teculiar/web-core/components/ui/status-pill";
import { notify, notifyResponse } from "@teculiar/web-core/components/ui/toast-provider";
import styles from "./admin-dashboard.module.css";

export function ModulesManager({ initialPrices }: { initialPrices: ApiDomainPrice[] }) {
  const c = getDictionary(useLocale()).admin.modules;
  const [modules, setModules] = useState<ApiModule[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/modules`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setModules(data);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function toggleActive(mod: ApiModule) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/modules/${mod.name}`, {
      body: JSON.stringify({ active: !mod.active }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    if (response.ok) {
      const data = await response.json().catch(() => null);
      if (Array.isArray(data)) setModules(data);
      notify.success((mod.active ? c.moduleDisabled : c.moduleEnabled).replace("{label}", mod.label));
    } else {
      notify.error(c.moduleUpdateFailed);
    }
  }

  if (loading) {
    return <div style={{ padding: 16, color: "var(--muted)", fontSize: "0.9rem" }}>{c.loadingModules}</div>;
  }

  const selectedModule = modules.find((m) => m.name === selected);

  return (
    <div className={styles.modulesLayout}>
      <div className={styles.modulesList}>
        {modules.map((mod) => (
          <div
            className={`${styles.moduleCard}${selected === mod.name ? ` ${styles.moduleCardActive}` : ""}`}
            key={mod.name}
          >
            <div className={styles.moduleCardHeader}>
              <div>
                <strong className={styles.moduleName}>{mod.label}</strong>
                <p className={styles.moduleDesc}>{mod.description}</p>
              </div>
              <div className={styles.moduleCardActions}>
                <StatusPill label={mod.active ? c.active : c.inactive} tone={mod.active ? "good" : "neutral"} />
                <Button
                  icon={mod.active ? EyeOff : Eye}
                  type="button"
                  variant="secondary"
                  onClick={() => toggleActive(mod)}
                >
                  {mod.active ? c.disable : c.enable}
                </Button>
                <Button
                  icon={Settings}
                  type="button"
                  variant={selected === mod.name ? "secondary" : "ghost"}
                  onClick={() => setSelected(selected === mod.name ? null : mod.name)}
                >
                  {c.configure}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedModule?.name === "resellbiz" && (
        <ResellbizConfig
          initialPrices={initialPrices}
          module={selectedModule}
          onSaved={(updated) => setModules((prev) => prev.map((m) => (m.name === "resellbiz" ? updated : m)))}
        />
      )}

      {selectedModule?.name === "virtualmin" && (
        <VirtualminConfig
          initial={selectedModule.config}
          onSaved={(updated) => setModules((prev) => prev.map((m) => (m.name === "virtualmin" ? updated : m)))}
        />
      )}

      {selectedModule?.kind === "payment" && (
        <div className={styles.moduleConfig}>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>{c.paymentCredsHint}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.location.assign(surfaceHref(window.location.pathname, "/admin/payment-gateways"))}
          >
            {c.openPaymentGateways}
          </Button>
        </div>
      )}
    </div>
  );
}

function ResellbizConfig({ initialPrices, module, onSaved }: { initialPrices: ApiDomainPrice[]; module: ApiModule; onSaved: (updated: ApiModule) => void }) {
  const locale = useLocale();
  const c = getDictionary(locale).admin.modules;
  const [prices, setPrices] = useState<ApiDomainPrice[]>(initialPrices);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [config, setConfig] = useState({
    mode: String(module.config.mode ?? "test"),
    resellerId: String(module.config.resellerId ?? ""),
    apiKey: String(module.config.apiKey ?? ""),
    defaultNs: String(module.config.defaultNs ?? "")
  });
  const [savingConfig, setSavingConfig] = useState(false);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    const response = await fetch(`${API_BASE_URL}/admin/dev/modules/resellbiz`, {
      body: JSON.stringify({
        config: {
          mode: config.mode,
          resellerId: config.resellerId,
          // Skip the masked placeholder so saving without retyping keeps the stored key.
          apiKey: config.apiKey === "********" ? "********" : config.apiKey,
          defaultNs: config.defaultNs
        }
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    setSavingConfig(false);
    if (response.ok) {
      const data = await response.json().catch(() => null);
      if (Array.isArray(data)) {
        const rb = data.find((m: ApiModule) => m.name === "resellbiz");
        if (rb) {
          onSaved(rb);
          setConfig({
            mode: String(rb.config.mode ?? "test"),
            resellerId: String(rb.config.resellerId ?? ""),
            apiKey: String(rb.config.apiKey ?? ""),
            defaultNs: String(rb.config.defaultNs ?? "")
          });
        }
      }
      notify.success(c.resellbizSaved);
    } else {
      notify.error(c.resellbizSaveFailed);
    }
  }

  async function sync() {
    setSyncing(true);
    const response = await fetch(`${API_BASE_URL}/orders/admin/domain-prices/sync`, {
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setSyncing(false);
    if (response.ok) {
      notify.success(c.domainPricesSynced);
      const updated = await fetch(`${API_BASE_URL}/orders/admin/domain-prices`, { headers: authHeaders() }).then((r) => r.json().catch(() => []));
      if (Array.isArray(updated)) setPrices(updated);
    } else {
      notify.error(c.syncFailed);
    }
  }

  async function upsertPrice(formData: FormData) {
    const response = await fetch(`${API_BASE_URL}/orders/admin/domain-prices`, {
      body: JSON.stringify({
        action: String(formData.get("action") ?? "register"),
        amountCents: formData.get("amountCents") ? Math.round(Number(formData.get("amountCents")) * 100) : undefined,
        manual: formData.get("manual") === "on",
        suggested: formData.get("suggested") === "on",
        tld: String(formData.get("tld") ?? "").replace(/^\./, ""),
        years: Number(formData.get("years") ?? 1)
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    setMessage(await notifyResponse(response, c.priceSaved, c.priceSaveFailed));
  }

  return (
    <div className={styles.moduleConfig}>
      <div className={styles.moduleConfigHeader}>
        <h3>{c.resellbizCreds}</h3>
      </div>
      <p style={{ padding: "0 16px 12px", margin: 0, fontSize: "0.88rem", color: "var(--muted)" }} dangerouslySetInnerHTML={{ __html: c.resellbizCredsHintHtml }} />
      <form className={styles.form} onSubmit={saveConfig}>
        <div className={styles.formGrid}>
          <label>
            {c.apiMode}
            <select value={config.mode} onChange={(e) => setConfig({ ...config, mode: e.target.value })}>
              <option value="test">{c.modeTest}</option>
              <option value="live">{c.modeLive}</option>
            </select>
          </label>
          <label>
            {c.resellerId}
            <input
              placeholder="auth-userid"
              value={config.resellerId}
              onChange={(e) => setConfig({ ...config, resellerId: e.target.value })}
            />
          </label>
          <label>
            {c.apiKey}
            <input
              autoComplete="off"
              placeholder={config.apiKey === "********" ? "••••••••" : c.enterApiKey}
              type="password"
              value={config.apiKey === "********" ? "" : config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            />
          </label>
          <label className={styles.formSpan2}>
            {c.defaultNameServers}
            <input
              placeholder="ns5.dezhost.com, ns6.dezhost.com"
              value={config.defaultNs}
              onChange={(e) => setConfig({ ...config, defaultNs: e.target.value })}
            />
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
              {c.defaultNsHint}
            </span>
          </label>
        </div>
        <div className={styles.formActions}>
          <Button icon={Save} type="submit">{savingConfig ? c.saving : c.saveCredentials}</Button>
        </div>
      </form>

      <div className={styles.moduleConfigHeader}>
        <h3>{c.resellbizPrices}</h3>
        {module.active ? (
          <Button icon={RefreshCw} type="button" variant="secondary" onClick={sync}>
            {syncing ? c.syncing : c.syncFromResellbiz}
          </Button>
        ) : (
          <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{c.moduleDisabledManual}</span>
        )}
      </div>

      <form action={upsertPrice} className={styles.form}>
        <h4 style={{ margin: "0 0 4px", fontSize: "0.85rem", color: "var(--muted)" }}>{c.addUpdatePrice}</h4>
        <div className={styles.formGrid}>
          <label>{c.tld}<input name="tld" placeholder=".de" /></label>
          <label>{c.action}<select name="action"><option value="register">{c.register}</option><option value="transfer">{c.transfer}</option><option value="renew">{c.renew}</option></select></label>
          <label>{c.years}<input defaultValue="1" min="1" max="10" name="years" type="number" /></label>
          <label>{c.priceEur}<input min="0" name="amountCents" placeholder={c.leaveBlankResellbiz} step="0.01" type="number" /></label>
          <label><span><input name="manual" type="checkbox" /> {c.manualOverride}</span></label>
          <label><span><input name="suggested" type="checkbox" /> {c.showAsSuggestion}</span></label>
        </div>
        <div className={styles.formActions}>
          <Button icon={Save} type="submit">{c.savePrice}</Button>
          {message ? <span style={{ fontSize: "0.85rem", color: "var(--muted)", alignSelf: "center" }}>{message}</span> : null}
        </div>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th>{c.tld}</th>
            <th>{c.action}</th>
            <th>{c.years}</th>
            <th>{c.colPrice}</th>
            <th>{c.colManual}</th>
            <th>{c.colSuggested}</th>
            <th>{c.colLastUpdate}</th>
          </tr>
        </thead>
        <tbody>
          {prices.length ? prices.map((price) => (
            <tr key={`${price.tld}-${price.action}-${price.years}`}>
              <td>.{price.tld}</td>
              <td>{price.action}</td>
              <td>{price.years}</td>
              <td>{price.amountCents > 0 ? money(price.amountCents, price.currency, locale) : c.resellbizLive}</td>
              <td>{price.manual ? c.yes : "—"}</td>
              <td>{price.suggested ? c.yes : "—"}</td>
              <td>{price.updatedAt ? new Date(price.updatedAt).toLocaleDateString("de-DE") : "—"}</td>
            </tr>
          )) : (
            <tr><td colSpan={7} style={{ color: "var(--muted)" }}>{c.noPricesSynced}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function VirtualminConfig({ initial, onSaved }: { initial: Record<string, unknown>; onSaved: (updated: ApiModule) => void }) {
  const c = getDictionary(useLocale()).admin.modules;
  const [config, setConfig] = useState({
    allowSelfSigned: Boolean(initial.allowSelfSigned),
    endpoint: String(initial.endpoint ?? ""),
    password: String(initial.password ?? ""),
    username: String(initial.username ?? ""),
    jobDelayMinutes: String(initial.jobDelayMinutes ?? "0")
  });
  const [active, setActive] = useState(true);
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const response = await fetch(`${API_BASE_URL}/admin/dev/modules/virtualmin`, {
      body: JSON.stringify({
        active,
        config: {
          allowSelfSigned: config.allowSelfSigned,
          endpoint: config.endpoint,
          password: config.password || initial.password,
          username: config.username,
          jobDelayMinutes: config.jobDelayMinutes
        }
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "PATCH"
    });
    if (response.ok) {
      const data = await response.json().catch(() => null);
      if (Array.isArray(data)) {
        const vm = data.find((m: ApiModule) => m.name === "virtualmin");
        if (vm) onSaved(vm);
      }
      notify.success(c.virtualminSaved);
      setMessage(c.saved);
    } else {
      notify.error(c.virtualminSaveFailed);
      setMessage(c.saveFailedShort);
    }
  }

  return (
    <div className={styles.moduleConfig}>
      <div className={styles.moduleConfigHeader}>
        <h3>{c.virtualminConfig}</h3>
      </div>
      <p style={{ padding: "0 16px 12px", margin: 0, fontSize: "0.88rem", color: "var(--muted)" }}>
        {c.virtualminHint}
      </p>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.formGrid}>
          <label className={styles.formSpan2}>
            {c.vmServerUrl}
            <input
              placeholder="https://hosting.example.com:10000"
              value={config.endpoint}
              onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
            />
          </label>
          <label>
            {c.adminUsername}
            <input
              autoComplete="username"
              placeholder="root"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
            />
          </label>
          <label>
            {c.adminPassword}
            <input
              autoComplete="current-password"
              placeholder={initial.password ? "••••••••" : c.enterPassword}
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
            />
          </label>
          <label>
            {c.minutesBetweenJobs}
            <input
              min="0"
              step="1"
              type="number"
              value={config.jobDelayMinutes}
              onChange={(e) => setConfig({ ...config, jobDelayMinutes: e.target.value })}
            />
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
              {c.minutesBetweenJobsHint}
            </span>
          </label>
          <label className={styles.formSpan2}>
            <span>
              <input
                checked={config.allowSelfSigned}
                type="checkbox"
                onChange={(e) => setConfig({ ...config, allowSelfSigned: e.target.checked })}
              />{" "}
              {c.allowSelfSigned}
            </span>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
              {c.allowSelfSignedHint}
            </span>
          </label>
        </div>
        <div className={styles.formActions}>
          <Button icon={Save} type="submit">{c.saveVirtualminConfig}</Button>
          {message ? <span style={{ fontSize: "0.85rem", color: "var(--muted)", alignSelf: "center" }}>{message}</span> : null}
        </div>
      </form>
    </div>
  );
}
