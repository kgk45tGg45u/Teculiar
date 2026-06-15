"use client";

import { Eye, EyeOff, RefreshCw, Save, Settings, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, money, type ApiDomainPrice, type ApiModule } from "../../lib/api";
import { Button } from "../ui/button";
import { StatusPill } from "../ui/status-pill";
import { notify, notifyResponse } from "../ui/toast-provider";
import styles from "./admin-dashboard.module.css";

export function ModulesManager({ initialPrices }: { initialPrices: ApiDomainPrice[] }) {
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
      notify.success(`${mod.label} ${mod.active ? "disabled" : "enabled"}.`);
    } else {
      notify.error("Failed to update module.");
    }
  }

  if (loading) {
    return <div style={{ padding: 16, color: "var(--muted)", fontSize: "0.9rem" }}>Loading modules…</div>;
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
                <StatusPill label={mod.active ? "Active" : "Inactive"} tone={mod.active ? "good" : "neutral"} />
                <Button
                  icon={mod.active ? EyeOff : Eye}
                  type="button"
                  variant="secondary"
                  onClick={() => toggleActive(mod)}
                >
                  {mod.active ? "Disable" : "Enable"}
                </Button>
                <Button
                  icon={Settings}
                  type="button"
                  variant={selected === mod.name ? "secondary" : "ghost"}
                  onClick={() => setSelected(selected === mod.name ? null : mod.name)}
                >
                  Configure
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
    </div>
  );
}

function ResellbizConfig({ initialPrices, module, onSaved }: { initialPrices: ApiDomainPrice[]; module: ApiModule; onSaved: (updated: ApiModule) => void }) {
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
      notify.success("Resell.biz credentials saved.");
    } else {
      notify.error("Failed to save Resell.biz config.");
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
      notify.success("Domain prices synced.");
      const updated = await fetch(`${API_BASE_URL}/orders/admin/domain-prices`, { headers: authHeaders() }).then((r) => r.json().catch(() => []));
      if (Array.isArray(updated)) setPrices(updated);
    } else {
      notify.error("Sync failed.");
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
    setMessage(await notifyResponse(response, "Price saved.", "Price save failed."));
  }

  return (
    <div className={styles.moduleConfig}>
      <div className={styles.moduleConfigHeader}>
        <h3>Resell.biz — API Credentials</h3>
      </div>
      <p style={{ padding: "0 16px 12px", margin: 0, fontSize: "0.88rem", color: "var(--muted)" }}>
        Credentials are stored in the database and used for domain registration, transfer, renewal and
        price sync. The server <code>.env</code> is only a fallback. Leave the API key blank to keep the stored one.
      </p>
      <form className={styles.form} onSubmit={saveConfig}>
        <div className={styles.formGrid}>
          <label>
            API mode
            <select value={config.mode} onChange={(e) => setConfig({ ...config, mode: e.target.value })}>
              <option value="test">Test (test.httpapi.com)</option>
              <option value="live">Live (httpapi.com)</option>
            </select>
          </label>
          <label>
            Reseller ID
            <input
              placeholder="auth-userid"
              value={config.resellerId}
              onChange={(e) => setConfig({ ...config, resellerId: e.target.value })}
            />
          </label>
          <label>
            API key
            <input
              autoComplete="off"
              placeholder={config.apiKey === "********" ? "••••••••" : "Enter API key"}
              type="password"
              value={config.apiKey === "********" ? "" : config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            />
          </label>
          <label className={styles.formSpan2}>
            Default name servers
            <input
              placeholder="ns5.dezhost.com, ns6.dezhost.com"
              value={config.defaultNs}
              onChange={(e) => setConfig({ ...config, defaultNs: e.target.value })}
            />
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
              Used when the customer leaves name servers blank at checkout. Falls back to ns5.dezhost.com, ns6.dezhost.com.
            </span>
          </label>
        </div>
        <div className={styles.formActions}>
          <Button icon={Save} type="submit">{savingConfig ? "Saving…" : "Save Credentials"}</Button>
        </div>
      </form>

      <div className={styles.moduleConfigHeader}>
        <h3>Resell.biz — Domain Prices</h3>
        {module.active ? (
          <Button icon={RefreshCw} type="button" variant="secondary" onClick={sync}>
            {syncing ? "Syncing…" : "Sync from Resell.biz"}
          </Button>
        ) : (
          <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>Module disabled — prices are managed manually below.</span>
        )}
      </div>

      <form action={upsertPrice} className={styles.form}>
        <h4 style={{ margin: "0 0 4px", fontSize: "0.85rem", color: "var(--muted)" }}>Add / Update Price</h4>
        <div className={styles.formGrid}>
          <label>TLD<input name="tld" placeholder=".de" /></label>
          <label>Action<select name="action"><option value="register">Register</option><option value="transfer">Transfer</option><option value="renew">Renew</option></select></label>
          <label>Years<input defaultValue="1" min="1" max="10" name="years" type="number" /></label>
          <label>Price (EUR)<input min="0" name="amountCents" placeholder="Leave blank for Resell.biz price" step="0.01" type="number" /></label>
          <label><span><input name="manual" type="checkbox" /> Manual override</span></label>
          <label><span><input name="suggested" type="checkbox" /> Show as suggestion</span></label>
        </div>
        <div className={styles.formActions}>
          <Button icon={Save} type="submit">Save Price</Button>
          {message ? <span style={{ fontSize: "0.85rem", color: "var(--muted)", alignSelf: "center" }}>{message}</span> : null}
        </div>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th>TLD</th>
            <th>Action</th>
            <th>Years</th>
            <th>Price</th>
            <th>Manual</th>
            <th>Suggested</th>
            <th>Last update</th>
          </tr>
        </thead>
        <tbody>
          {prices.length ? prices.map((price) => (
            <tr key={`${price.tld}-${price.action}-${price.years}`}>
              <td>.{price.tld}</td>
              <td>{price.action}</td>
              <td>{price.years}</td>
              <td>{price.amountCents > 0 ? money(price.amountCents, price.currency) : "Resell.biz live"}</td>
              <td>{price.manual ? "yes" : "—"}</td>
              <td>{price.suggested ? "yes" : "—"}</td>
              <td>{price.updatedAt ? new Date(price.updatedAt).toLocaleDateString("de-DE") : "—"}</td>
            </tr>
          )) : (
            <tr><td colSpan={7} style={{ color: "var(--muted)" }}>No prices synced yet. Click "Sync from Resell.biz" to import.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function VirtualminConfig({ initial, onSaved }: { initial: Record<string, unknown>; onSaved: (updated: ApiModule) => void }) {
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
      notify.success("Virtualmin credentials saved.");
      setMessage("Saved.");
    } else {
      notify.error("Failed to save Virtualmin config.");
      setMessage("Save failed.");
    }
  }

  return (
    <div className={styles.moduleConfig}>
      <div className={styles.moduleConfigHeader}>
        <h3>Virtualmin — Server Configuration</h3>
      </div>
      <p style={{ padding: "0 16px 12px", margin: 0, fontSize: "0.88rem", color: "var(--muted)" }}>
        These credentials are used for automated hosting account provisioning.
        Changes are stored in the database and take effect immediately.
      </p>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.formGrid}>
          <label className={styles.formSpan2}>
            Virtualmin Server URL
            <input
              placeholder="https://hosting.example.com:10000"
              value={config.endpoint}
              onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
            />
          </label>
          <label>
            Admin Username
            <input
              autoComplete="username"
              placeholder="root"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
            />
          </label>
          <label>
            Admin Password
            <input
              autoComplete="current-password"
              placeholder={initial.password ? "••••••••" : "Enter password"}
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
            />
          </label>
          <label>
            Minutes between server jobs
            <input
              min="0"
              step="1"
              type="number"
              value={config.jobDelayMinutes}
              onChange={(e) => setConfig({ ...config, jobDelayMinutes: e.target.value })}
            />
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
              Minimum delay enforced between create / suspend / delete jobs so Virtualmin never gets simultaneous changes. 0 disables it.
            </span>
          </label>
          <label className={styles.formSpan2}>
            <span>
              <input
                checked={config.allowSelfSigned}
                type="checkbox"
                onChange={(e) => setConfig({ ...config, allowSelfSigned: e.target.checked })}
              />{" "}
              Allow Self-Signed SSL Certificate
            </span>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
              Enable only if your Virtualmin server uses a self-signed certificate (not from a trusted CA).
            </span>
          </label>
        </div>
        <div className={styles.formActions}>
          <Button icon={Save} type="submit">Save Virtualmin Config</Button>
          {message ? <span style={{ fontSize: "0.85rem", color: "var(--muted)", alignSelf: "center" }}>{message}</span> : null}
        </div>
      </form>
    </div>
  );
}
