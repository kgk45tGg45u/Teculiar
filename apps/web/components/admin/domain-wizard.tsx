"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, authFetch } from "@teculiar/web-core/lib/api";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import { useLocale } from "@teculiar/web-core/components/layout/locale-provider";
import { Button } from "@teculiar/web-core/components/ui/button";
import { StatusPill } from "@teculiar/web-core/components/ui/status-pill";
import { notifyResponse } from "@teculiar/web-core/components/ui/toast-provider";
import styles from "./admin-dashboard.module.css";

type TxtRecord = { name: string; value: string } | null;
type DomainRow = { host: string; surface: string; status: string; txtRecord: TxtRecord };
type Overview = {
  tenant: { subdomain: string; defaultHost: string };
  edge: { host: string; ip: string };
  config: { apexMode?: string; dashboards?: string; clientLabel?: string } | null;
  domains: DomainRow[];
};

/**
 * Tenant domain-setup wizard (Phase 4.6f). The tenant picks how their site runs — own website on the
 * apex, or everything pointed at Teculiar — plus where the dashboards live (subdomains vs apex paths)
 * and their client-area subdomain label ("client", "portal", "kunde", …). The wizard registers the
 * hosts (always pending + DNS-TXT ownership proof), prints the exact DNS records, and verifies each
 * host with one click. Onboarding = DNS only, never web-server config.
 *
 * Phase 8.1: the self-hosted-storefront option (`blue_selfhosted`) is paused — the radio + install
 * command are hidden. The backend still accepts the value, so a tenant that had saved it is coerced
 * to `external` here (with a one-line note) instead of rendering a dead control. See
 * docs/self-hosting-deferred.md.
 */
export function DomainWizard() {
  const d = getDictionary(useLocale()).admin.domains;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [domain, setDomain] = useState("");
  const [apexMode, setApexMode] = useState("external");
  const [dashboards, setDashboards] = useState("subdomains");
  const [clientLabel, setClientLabel] = useState("client");
  const [selfhostedCoerced, setSelfhostedCoerced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState("");

  const load = useCallback(async () => {
    const response = await authFetch(`${API_BASE_URL}/admin/tenant-domains`, {}, "admin");
    if (!response.ok) {
      setUnavailable(true);
      return;
    }
    const data = (await response.json()) as Overview;
    setOverview(data);
    if (data.config) {
      // Self-hosting is paused (Phase 8.1): coerce a stale `blue_selfhosted` config to `external`
      // rather than show a dead radio. The saved value is only overwritten if the admin re-saves.
      const savedApex = String(data.config.apexMode ?? "external");
      setSelfhostedCoerced(savedApex === "blue_selfhosted");
      setApexMode(savedApex === "blue_selfhosted" ? "external" : savedApex);
      setDashboards(String(data.config.dashboards ?? "subdomains"));
      setClientLabel(String(data.config.clientLabel ?? "client"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // With an external apex the dashboards can only live on subdomains (we never touch their web server).
  useEffect(() => {
    if (apexMode === "external" && dashboards === "apex_paths") {
      setDashboards("subdomains");
    }
  }, [apexMode, dashboards]);

  const plannedHosts = useMemo(() => {
    if (!domain) {
      return [] as Array<{ host: string; surface: string }>;
    }
    const label = clientLabel || "client";
    const hosts: Array<{ host: string; surface: string }> = [];
    if (apexMode !== "external") {
      hosts.push({ host: domain, surface: "apex" }, { host: `www.${domain}`, surface: "apex" });
    }
    if (dashboards === "subdomains") {
      hosts.push({ host: `admin.${domain}`, surface: "admin" }, { host: `${label}.${domain}`, surface: "client" });
    }
    return hosts;
  }, [domain, apexMode, dashboards, clientLabel]);

  async function generate() {
    setBusy(true);
    try {
      const configResponse = await authFetch(`${API_BASE_URL}/admin/tenant-domains/config`, {
        body: JSON.stringify({ apexMode, dashboards, clientLabel: clientLabel || "client" }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      }, "admin");
      await notifyResponse(configResponse, d.savedPlan, d.addFailed);
      if (!configResponse.ok) {
        return;
      }
      for (const planned of plannedHosts) {
        const response = await authFetch(`${API_BASE_URL}/admin/tenant-domains`, {
          body: JSON.stringify(planned),
          headers: { "Content-Type": "application/json" },
          method: "POST"
        }, "admin");
        if (!response.ok) {
          await notifyResponse(response, "", `${d.addFailed}: ${planned.host}`);
        }
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function verify(host: string) {
    setVerifying(host);
    try {
      const response = await authFetch(`${API_BASE_URL}/admin/tenant-domains/verify`, {
        body: JSON.stringify({ host }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }, "admin");
      const result = (await response.clone().json().catch(() => null)) as { ok?: boolean } | null;
      await notifyResponse(response, result?.ok ? d.active : d.stillPending, d.verifyFailed);
      await load();
    } finally {
      setVerifying("");
    }
  }

  if (unavailable) {
    return (
      <section className={styles.panel}>
        <p>{d.notMultiTenant}</p>
      </section>
    );
  }

  const edge = overview?.edge;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{d.title}</span>
          <h2>{d.subtitle}</h2>
        </div>
      </div>

      <div className={styles.form}>
        <label>
          {d.yourDomain}
          <input
            placeholder={d.domainPlaceholder}
            value={domain}
            onChange={(event) => setDomain(event.target.value.trim().toLowerCase())}
          />
        </label>

        <fieldset>
          <legend>{d.apexModeTitle}</legend>
          {selfhostedCoerced ? <p><small>{d.apexSelfhostedRetired}</small></p> : null}
          {[
            { value: "external", label: d.apexExternal, help: d.apexExternalHelp },
            { value: "blue_hosted", label: d.apexHosted, help: d.apexHostedHelp }
          ].map((option) => (
            <label className={styles.inlineForm} key={option.value} title={option.help}>
              <input
                checked={apexMode === option.value}
                name="apexMode"
                type="radio"
                value={option.value}
                onChange={() => setApexMode(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>{d.dashboardsTitle}</legend>
          <label className={styles.inlineForm} title={d.dashSubdomainsHelp}>
            <input checked={dashboards === "subdomains"} name="dashboards" type="radio" value="subdomains" onChange={() => setDashboards("subdomains")} />
            {d.dashSubdomains}
          </label>
          <label className={styles.inlineForm} title={d.dashApexPathsHelp}>
            <input
              checked={dashboards === "apex_paths"}
              disabled={apexMode === "external"}
              name="dashboards"
              type="radio"
              value="apex_paths"
              onChange={() => setDashboards("apex_paths")}
            />
            {d.dashApexPaths}
          </label>
        </fieldset>

        {dashboards === "subdomains" ? (
          <label>
            {d.clientLabelTitle}
            <input
              placeholder="client"
              value={clientLabel}
              onChange={(event) => setClientLabel(event.target.value.trim().toLowerCase())}
            />
            <small>{d.clientLabelHelp}</small>
          </label>
        ) : null}

        {apexMode === "blue_hosted" ? <p>{d.hostedNote}</p> : null}

        <Button disabled={busy || plannedHosts.length === 0} type="button" onClick={() => void generate()}>
          {busy ? d.saving : d.generate}
        </Button>
      </div>

      {overview && overview.domains.length > 0 ? (
        <>
          <h3>{d.hosts}</h3>
          <table className="table">
            <thead>
              <tr>
                <th>{d.host}</th>
                <th>{d.surface}</th>
                <th>{d.status}</th>
                <th>{d.dnsRecord}</th>
                <th>{d.txtRecord}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {overview.domains.map((row) => (
                <tr key={row.host}>
                  <td>{row.host}</td>
                  <td>{row.surface}</td>
                  <td>
                    <StatusPill label={row.status === "active" ? d.active : d.pending} tone={row.status === "active" ? "good" : "warn"} />
                  </td>
                  <td>
                    <code>
                      {row.host.split(".").length > 2
                        ? `${row.host} CNAME ${edge?.host}`
                        : `${row.host} A ${edge?.ip}`}
                    </code>
                  </td>
                  <td>{row.txtRecord ? <code>{`${row.txtRecord.name} TXT "${row.txtRecord.value}"`}</code> : "—"}</td>
                  <td>
                    {row.status !== "active" ? (
                      <Button type="button" variant="secondary" onClick={() => void verify(row.host)}>
                        {verifying === row.host ? d.verifying : d.verify}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}
