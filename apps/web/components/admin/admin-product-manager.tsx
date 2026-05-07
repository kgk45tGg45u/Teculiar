"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, type ApiProduct } from "../../lib/api";
import { Button } from "../ui/button";
import styles from "./admin-product-manager.module.css";

type FormState = { kind: "idle" | "loading" | "ok" | "error"; message?: string };
type VirtualminOption = {
  differences?: Array<{ key: string; label: string; value: string }>;
  id: string;
  limits?: { bandwidth?: string; databases?: string; disk?: string; mailboxes?: string; subServers?: string };
  name: string;
};

export function AdminProductManager() {
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [editing, setEditing] = useState<ApiProduct | undefined>();
  const [virtualmin, setVirtualmin] = useState<{ plans: VirtualminOption[]; templates: VirtualminOption[] }>({ plans: [], templates: [] });
  const [module, setModule] = useState("resellbiz");
  const [type, setType] = useState("DOMAIN");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [detectedPlans, setDetectedPlans] = useState<VirtualminOption[]>([]);

  useEffect(() => {
    void refreshProducts();
    void detectVirtualminPlans();
  }, []);

  async function submit(formData: FormData) {
    setState({ kind: "loading", message: "Speichere Produkt..." });
    const setupFeeCents = cents(formData.get("setupFee"));
    const prices = ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "YEAR_1", "YEAR_2", "YEAR_3", "YEAR_4"]
      .map((billingCycle) => {
        const amountCents = cents(formData.get(`price_${billingCycle}`));
        return amountCents === undefined ? undefined : { amountCents, billingCycle, setupFeeCents };
      })
      .filter(Boolean);

    try {
      const productId = String(formData.get("productId") ?? "");
      const response = await fetch(`${API_BASE_URL}/admin/dev/products${productId ? `/${productId}` : ""}`, {
        body: JSON.stringify({
          configurableOptions: [
            ...preservedConfigs(editing),
            ...customFields(formData.get("customFields")),
            ...virtualminFields(formData)
          ],
          description: String(formData.get("description") ?? ""),
          homepageVisible: formData.get("homepageVisible") === "on",
          name: String(formData.get("name") ?? ""),
          prices,
          provisioningModule: String(formData.get("provisioningModule") ?? ""),
          slug: String(formData.get("slug") ?? ""),
          type: String(formData.get("type") ?? "DOMAIN")
        }),
        headers: { "Content-Type": "application/json", ...authHeaders() },
        method: productId ? "PATCH" : "POST"
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.message === "string" ? payload.message : "Produkt konnte nicht gespeichert werden.");
      }

      setState({ kind: "ok", message: "Produkt gespeichert." });
      setEditing(undefined);
      await refreshProducts();
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Produkt fehlgeschlagen." });
    }
  }

  async function removeProduct(product: ApiProduct) {
    setState({ kind: "loading", message: "Entferne Produkt..." });
    const response = await fetch(`${API_BASE_URL}/admin/dev/products/${product.id}`, { headers: authHeaders(), method: "DELETE" });
    if (!response.ok) {
      setState({ kind: "error", message: "Produkt konnte nicht entfernt werden." });
      return;
    }
    setState({ kind: "ok", message: "Produkt entfernt." });
    await refreshProducts();
  }

  async function refreshProducts() {
    const response = await fetch(`${API_BASE_URL}/products`);
    const payload = await response.json().catch(() => []);
    setProducts(Array.isArray(payload) ? payload : []);
  }

  async function detectVirtualminPlans() {
    const response = await fetch(`${API_BASE_URL}/admin/dev/virtualmin/plans/detect`, { headers: authHeaders() });
    const payload = await response.json().catch(() => ({}));
    setVirtualmin({ plans: payload.plans ?? [], templates: payload.templates ?? [] });
    setDetectedPlans(payload.plans ?? []);
  }

  async function syncVirtualminPlans() {
    const response = await fetch(`${API_BASE_URL}/admin/dev/virtualmin/plans/sync`, {
      body: JSON.stringify({ plans: detectedPlans }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));
    setVirtualmin({ plans: payload.plans ?? [], templates: payload.templates ?? [] });
    setDetectedPlans(payload.plans ?? []);
    await refreshProducts();
  }

  const plan = virtualmin.plans.find((option) => option.id === selectedPlan);

  return (
    <div className={styles.stack}>
      <section className={styles.products}>
        <h2>Existing products</h2>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={detectVirtualminPlans}>Detect Virtualmin plans</Button>
          <Button type="button" onClick={syncVirtualminPlans}>Confirm and save plans</Button>
        </div>
        {detectedPlans.length ? (
          <div className={styles.planReview}>
            {detectedPlans.map((plan) => (
              <article key={plan.id}>
                <strong>{plan.name}</strong>
                <span>Virtualmin ID {plan.id}</span>
                <ul>
                  {(plan.differences ?? []).map((item) => <li key={item.key}>{item.label}: {item.value}</li>)}
                </ul>
              </article>
            ))}
          </div>
        ) : null}
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Typ</th>
                <th>Modul</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{typeLabel(product.type)}</td>
                  <td>{product.provisioningModule ?? "none"}</td>
                  <td className={styles.actions}>
                    <Button type="button" variant="secondary" onClick={() => {
                      setEditing(product);
                      setModule(product.provisioningModule ?? "none");
                      setType(product.type);
                      setSelectedPlan(String(product.configs?.find((config) => config.key === "virtualmin_plan")?.values?.[0] ?? ""));
                    }}>Edit</Button>
                    <Button type="button" variant="ghost" onClick={() => removeProduct(product)}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    <form action={submit} className={styles.form} key={editing?.id ?? "new"}>
      <input name="productId" type="hidden" value={editing?.id ?? ""} />
      <div className={styles.grid}>
        <label>
          Name
          <input defaultValue={editing?.name ?? ""} name="name" required placeholder="Domain .de" />
        </label>
        <label>
          Slug
          <input defaultValue={editing?.slug ?? ""} name="slug" required placeholder="domain-de" />
        </label>
        <label>
          Typ
          <select defaultValue={editing?.type ?? "DOMAIN"} name="type" onChange={(event) => setType(event.target.value)}>
            <option value="DOMAIN">Domain</option>
            <option value="SHARED_HOSTING">Web Hosting</option>
            <option value="VPS">VPS</option>
          </select>
        </label>
        <label>
          Modul
          <select defaultValue={editing?.provisioningModule ?? "resellbiz"} name="provisioningModule" onChange={(event) => setModule(event.target.value)}>
            <option value="resellbiz">ResellBiz</option>
            <option value="virtualmin">Virtualmin</option>
            <option value="none">Kein API</option>
          </select>
        </label>
        {type === "DOMAIN" ? (
          <p className={styles.note}>Domain pricing comes from Admin / Domain Prices. Product pricing is only shown as "from" the cheapest TLD.</p>
        ) : (
          ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "YEAR_1", "YEAR_2", "YEAR_3", "YEAR_4"].map((cycle) => (
            <label key={cycle}>
              {cycle} EUR
              <input defaultValue={priceValue(editing, cycle)} name={`price_${cycle}`} placeholder="9.90" />
            </label>
          ))
        )}
        <label>
          Setup EUR
          <input name="setupFee" placeholder="0" />
        </label>
        <label>
          Custom Fields
          <input name="customFields" placeholder="Hostname, PHP Version" />
        </label>
      </div>
      <label>
        Beschreibung
        <textarea defaultValue={editing?.description ?? ""} name="description" required rows={3} />
      </label>
      {module === "virtualmin" ? (
        <section className={styles.virtualminBox}>
          <label>
            Virtualmin Plan
            <select defaultValue={String(editing?.configs?.find((config) => config.key === "virtualmin_plan")?.values?.[0] ?? "")} name="virtualminPlan" onChange={(event) => setSelectedPlan(event.target.value)}>
              <option value="">Select plan</option>
              {virtualmin.plans.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          {plan ? (
            <div className={styles.limits}>
              <span>Disk: {plan.limits?.disk ?? "Unknown"}</span>
              <span>Bandwidth: {plan.limits?.bandwidth ?? "Unknown"}</span>
              <span>Email accounts: {plan.limits?.mailboxes ?? "Unknown"}</span>
              <span>Databases: {plan.limits?.databases ?? "Unknown"}</span>
              <span>Subdomains: {plan.limits?.subServers ?? "Unknown"}</span>
            </div>
          ) : null}
        </section>
      ) : null}
      <label className={styles.check}>
        <input defaultChecked={editing?.homepageVisible ?? true} name="homepageVisible" type="checkbox" />
        Auf Homepage zeigen
      </label>
      <Button type="submit">Produkt speichern</Button>
      {state.message ? <p className={styles[state.kind]}>{state.message}</p> : null}
    </form>
    </div>
  );
}

function cents(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }

  return Math.round(Number(raw.replace(",", ".")) * 100);
}

function customFields(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => ({
      key: field.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: field,
      required: false,
      values: []
    }));
}

function virtualminFields(formData: FormData) {
  if (String(formData.get("provisioningModule") ?? "") !== "virtualmin") {
    return [];
  }

  return [
    { key: "virtualmin_plan", label: "Virtualmin Plan", required: true, values: [String(formData.get("virtualminPlan") ?? "")] },
  ];
}

function preservedConfigs(product?: ApiProduct) {
  return (product?.configs ?? []).filter((config) => !["virtualmin_plan", "virtualmin_template"].includes(config.key));
}

function priceValue(product: ApiProduct | undefined, cycle: string) {
  const price = product?.prices.find((item) => item.billingCycle === cycle);
  return price ? String(price.amountCents / 100).replace(".", ",") : "";
}

function typeLabel(type: string) {
  return {
    DOMAIN: "Domain",
    SHARED_HOSTING: "Web hosting",
    VPS: "VPS"
  }[type] ?? type.toLowerCase().replace(/_/g, " ");
}
