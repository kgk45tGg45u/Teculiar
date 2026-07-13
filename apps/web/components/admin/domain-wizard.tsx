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
 * apex, our Blue theme self-hosted, or everything pointed at Teculiar — plus where the dashboards live
 * (subdomains vs apex paths) and their client-area subdomain label ("client", "portal", "kunde", …).
 * The wizard registers the hosts (always pending + DNS-TXT ownership proof), prints the exact DNS
 * records, and verifies each host with one click. Onboarding = DNS only, never web-server config.
 */
export function DomainWizard() {
  const d = getDictionary(useLocale()).admin.domains;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [domain, setDomain] = useState("");
  const [apexMode, setApexMode] = useState("external");
  const [dashboards, setDashboards] = useState("subdomains");
  const [clientLabel, setClientLabel] = useState("client");
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
      setApexMode(String(data.config.apexMode ?? "external"));
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
    if (apexMode === "blue_selfhosted") {
      hosts.push({ host: `api.${domain}`, surface: "api" });
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
          {[
            { value: "external", label: d.apexExternal, help: d.apexExternalHelp },
            { value: "blue_selfhosted", label: d.apexSelfhosted, help: d.apexSelfhostedHelp },
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

          {apexMode === "blue_selfhosted" && domain ? (
            <>
              <h3>{d.installTitle}</h3>
              <p>{d.installHelp}</p>
              <pre>
                <code>{`TENANT=${overview.tenant.subdomain} DOMAIN=${domain} bash <(curl -fsSL https://get.teculiar.com/install.sh)`}</code>
              </pre>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
