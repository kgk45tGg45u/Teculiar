"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, type ApiProduct, type ApiProductCategory } from "../../lib/api";
import { Button } from "../ui/button";
import { notify } from "../ui/toast-provider";
import styles from "./admin-product-manager.module.css";

type FormState = { kind: "idle" | "loading" | "ok" | "error"; message?: string };
type VirtualminOption = {
  differences?: Array<{ key: string; label: string; value: string }>;
  id: string;
  limits?: { bandwidth?: string; databases?: string; disk?: string; mailboxes?: string; subServers?: string };
  name: string;
};

export function AdminCategoryManager() {
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [categories, setCategories] = useState<ApiProductCategory[]>([]);
  const [editingCategory, setEditingCategory] = useState<ApiProductCategory | undefined>();

  useEffect(() => {
    void refreshCategories();
  }, []);

  async function refreshCategories() {
    const response = await fetch(`${API_BASE_URL}/admin/dev/product-categories`, { headers: authHeaders() });
    const payload = await response.json().catch(() => []);
    setCategories(Array.isArray(payload) ? payload : []);
  }

  async function saveCategory(formData: FormData) {
    setState({ kind: "loading", message: "Saving category…" });
    const categoryId = String(formData.get("categoryId") ?? "");
    const response = await fetch(`${API_BASE_URL}/admin/dev/product-categories${categoryId ? `/${categoryId}` : ""}`, {
      body: JSON.stringify({
        description: String(formData.get("categoryDescription") ?? ""),
        name: String(formData.get("categoryName") ?? ""),
        provisioningModule: String(formData.get("categoryModule") ?? "none"),
        slug: String(formData.get("categorySlug") ?? ""),
        sortOrder: Number(formData.get("categorySortOrder") ?? 0)
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: categoryId ? "PATCH" : "POST"
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = typeof payload.message === "string" ? payload.message : "Category could not be saved.";
      setState({ kind: "error", message });
      notify.error(message);
      return;
    }
    setState({ kind: "ok", message: "Category saved." });
    notify.success("Category saved.");
    setEditingCategory(undefined);
    await refreshCategories();
  }

  async function removeCategory(category: ApiProductCategory) {
    setState({ kind: "loading", message: "Removing category…" });
    const response = await fetch(`${API_BASE_URL}/admin/dev/product-categories/${category.id}`, { headers: authHeaders(), method: "DELETE" });
    if (!response.ok) {
      setState({ kind: "error", message: "Category could not be removed." });
      notify.error("Category could not be removed.");
      return;
    }
    setState({ kind: "ok", message: "Category removed." });
    notify.success("Category removed.");
    await refreshCategories();
  }

  return (
    <div className={styles.stack}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>{editingCategory ? `Edit: ${editingCategory.name}` : "New Category"}</h2>
        </div>
        <form action={saveCategory} className={styles.form} key={editingCategory?.id ?? "new-category"}>
          <input name="categoryId" type="hidden" value={editingCategory?.id ?? ""} />
          <div className={styles.grid}>
            <label>Name<input defaultValue={editingCategory?.name ?? ""} name="categoryName" required placeholder="Web Hosting" /></label>
            <label>Slug<input defaultValue={editingCategory?.slug ?? ""} name="categorySlug" required placeholder="webhosting" /></label>
            <label>
              Module
              <select defaultValue={editingCategory?.provisioningModule ?? "none"} name="categoryModule">
                <option value="virtualmin">Virtualmin</option>
                <option value="resellbiz">ResellBiz</option>
                <option value="hetzner">Hetzner</option>
                <option value="none">Manual</option>
              </select>
            </label>
            <label>Sort Order<input defaultValue={editingCategory?.sortOrder ?? 0} name="categorySortOrder" type="number" min="0" /></label>
          </div>
          <label>Description<textarea defaultValue={editingCategory?.description ?? ""} name="categoryDescription" rows={2} /></label>
          <div className={styles.formActions}>
            <Button size="sm" type="submit">Save Category</Button>
            {editingCategory ? <Button size="sm" type="button" variant="secondary" onClick={() => setEditingCategory(undefined)}>+ New Category</Button> : null}
            {state.message ? <span className={styles[state.kind]}>{state.message}</span> : null}
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}><h2>Categories</h2></div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Slug</th>
                <th>Module</th>
                <th>Products</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td className={styles.muted}>{category.sortOrder ?? 0}</td>
                  <td>{category.name}</td>
                  <td className={styles.mono}>{category.slug}</td>
                  <td>{moduleLabel(category.provisioningModule)}</td>
                  <td>{category.products?.length ?? 0}</td>
                  <td className={styles.rowActions}>
                    <Button size="sm" type="button" variant="secondary" onClick={() => setEditingCategory(category)}>Edit</Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => removeCategory(category)}>Remove</Button>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && <tr><td colSpan={6} className={styles.empty}>No categories yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function AdminProductManager() {
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiProductCategory[]>([]);
  const [editing, setEditing] = useState<ApiProduct | undefined>();
  const [virtualmin, setVirtualmin] = useState<{ plans: VirtualminOption[]; templates: VirtualminOption[] }>({ plans: [], templates: [] });
  const [module, setModule] = useState("resellbiz");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState("DOMAIN");
  const [domainRequirement, setDomainRequirement] = useState("NOT_NEEDED");
  const [freeDomainCycle, setFreeDomainCycle] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [detectedPlans, setDetectedPlans] = useState<VirtualminOption[]>([]);

  useEffect(() => {
    void refreshProducts();
    void refreshCategories();
  }, []);

  async function submit(formData: FormData) {
    setState({ kind: "loading", message: "Saving product…" });
    notify.info("Saving product…");
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
          categoryId: String(formData.get("categoryId") ?? "") || null,
          description: String(formData.get("description") ?? ""),
          domainRequirement: String(formData.get("domainRequirement") ?? "NOT_NEEDED"),
          freeDomainBillingCycle: String(formData.get("freeDomainBillingCycle") ?? "") || null,
          name: String(formData.get("name") ?? ""),
          prices,
          slug: String(formData.get("slug") ?? ""),
          sortOrder: Number(formData.get("sortOrder") ?? 0),
          type: String(formData.get("type") ?? "DOMAIN")
        }),
        headers: { "Content-Type": "application/json", ...authHeaders() },
        method: productId ? "PATCH" : "POST"
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.message === "string" ? payload.message : "Product could not be saved.");
      }

      setState({ kind: "ok", message: "Product saved." });
      notify.success("Product saved.");
      setEditing(undefined);
      setCategoryId("");
      await refreshProducts();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product save failed.";
      setState({ kind: "error", message });
      notify.error(message);
    }
  }

  async function removeProduct(product: ApiProduct) {
    if (!confirm(`Remove product "${product.name}"? This cannot be undone.`)) return;
    setState({ kind: "loading", message: "Removing product…" });
    const response = await fetch(`${API_BASE_URL}/admin/dev/products/${product.id}`, { headers: authHeaders(), method: "DELETE" });
    if (!response.ok) {
      setState({ kind: "error", message: "Product could not be removed." });
      notify.error("Product could not be removed.");
      return;
    }
    setState({ kind: "ok", message: "Product removed." });
    notify.success("Product removed.");
    await refreshProducts();
  }

  function editProduct(product: ApiProduct) {
    setEditing(product);
    setCategoryId(product.categoryId ?? product.category?.id ?? "");
    setModule(product.category ? product.category.provisioningModule ?? "none" : product.provisioningModule ?? "none");
    setType(product.type);
    setDomainRequirement(product.domainRequirement ?? "NOT_NEEDED");
    setFreeDomainCycle(product.freeDomainBillingCycle ?? "");
    setSelectedPlan(String(product.configs?.find((config) => config.key === "virtualmin_plan")?.values?.[0] ?? ""));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function refreshProducts() {
    const response = await fetch(`${API_BASE_URL}/products`);
    const payload = await response.json().catch(() => []);
    setProducts(Array.isArray(payload) ? payload : []);
  }

  async function refreshCategories() {
    const response = await fetch(`${API_BASE_URL}/admin/dev/product-categories`, { headers: authHeaders() });
    const payload = await response.json().catch(() => []);
    setCategories(Array.isArray(payload) ? payload : []);
  }

  async function detectVirtualminPlans() {
    const response = await fetch(`${API_BASE_URL}/admin/dev/virtualmin/plans/detect`, { headers: authHeaders() });
    const payload = await response.json().catch(() => ({}));
    setVirtualmin({ plans: payload.plans ?? [], templates: payload.templates ?? [] });
    setDetectedPlans(payload.plans ?? []);
    if (response.ok) {
      notify.success("Virtualmin plans detected.");
    } else {
      notify.error("Virtualmin plan detection failed.");
    }
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
    if (response.ok) {
      notify.success("Virtualmin plans saved.");
    } else {
      notify.error("Virtualmin plan sync failed.");
    }
    await refreshProducts();
  }

  const plan = virtualmin.plans.find((option) => option.id === selectedPlan);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const effectiveModule = selectedCategory ? selectedCategory.provisioningModule ?? "none" : module;
  // Domain products are the domain itself, and a "domain" category groups them — neither gets the
  // can-be-ordered-with-a-domain controls.
  const isDomainProduct = type === "DOMAIN" || /domain/i.test(selectedCategory?.slug ?? "") || /domain/i.test(selectedCategory?.name ?? "");
  const canOrderWithDomain = !isDomainProduct && domainRequirement !== "NOT_NEEDED";

  return (
    <div className={styles.stack}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>{editing ? `Edit: ${editing.name}` : "New Product"}</h2>
          {editing ? (
            <Button size="sm" type="button" variant="secondary" onClick={() => { setEditing(undefined); setCategoryId(""); setType("DOMAIN"); setDomainRequirement("NOT_NEEDED"); setFreeDomainCycle(""); }}>
              + New Product
            </Button>
          ) : null}
        </div>

        <form action={submit} className={styles.form} key={editing?.id ?? "new"}>
          <input name="productId" type="hidden" value={editing?.id ?? ""} />
          <input name="categoryModule" type="hidden" value={effectiveModule ?? "none"} />
          <input name="domainRequirement" type="hidden" value={isDomainProduct ? "NOT_NEEDED" : domainRequirement} />
          <input name="freeDomainBillingCycle" type="hidden" value={canOrderWithDomain ? freeDomainCycle : ""} />

          <fieldset className={styles.fieldset}>
            <legend>Basic Info</legend>
            <div className={styles.grid}>
              <label>Name<input defaultValue={editing?.name ?? ""} name="name" required placeholder="Web Hosting Basic" /></label>
              <label>Slug<input defaultValue={editing?.slug ?? ""} name="slug" required placeholder="web-hosting-basic" /></label>
              <label>
                Type
                <select defaultValue={editing?.type ?? "DOMAIN"} name="type" onChange={(e) => setType(e.target.value)}>
                  <option value="DOMAIN">Domain</option>
                  <option value="SHARED_HOSTING">Web Hosting</option>
                  <option value="VPS">VPS</option>
                </select>
              </label>
              <label>
                Category
                <select defaultValue={editing?.categoryId ?? editing?.category?.id ?? ""} name="categoryId" onChange={(e) => {
                  const nextCategory = categories.find((c) => c.id === e.target.value);
                  setCategoryId(e.target.value);
                  setModule(nextCategory?.provisioningModule ?? "none");
                }}>
                  <option value="">No Category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>Sort Order<input defaultValue={editing?.sortOrder ?? 0} name="sortOrder" type="number" min="0" placeholder="0" /></label>
              <label>Custom Fields<input defaultValue={customFieldsValue(editing)} name="customFields" placeholder="Hostname, PHP Version" /></label>
            </div>
            <label>Description<textarea defaultValue={editing?.description ?? ""} name="description" required rows={3} /></label>
          </fieldset>

          {isDomainProduct ? null : (
            <fieldset className={styles.fieldset}>
              <legend>Domain</legend>
              <label className={styles.checkboxRow}>
                <input
                  checked={canOrderWithDomain}
                  onChange={(e) => setDomainRequirement(e.target.checked ? "NECESSARY" : "NOT_NEEDED")}
                  type="checkbox"
                />
                Can be ordered with a domain
              </label>
              {canOrderWithDomain ? (
                <div className={styles.grid}>
                  <label>
                    Domain requirement
                    <select value={domainRequirement} onChange={(e) => setDomainRequirement(e.target.value)}>
                      <option value="NECESSARY">Necessary — domain required</option>
                      <option value="OPTIONAL">Optional — domain can be skipped</option>
                    </select>
                  </label>
                  <label>
                    Free domain included
                    <select value={freeDomainCycle} onChange={(e) => setFreeDomainCycle(e.target.value)}>
                      <option value="">No free domain</option>
                      {["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "YEAR_1", "YEAR_2", "YEAR_3", "YEAR_4"].map((cycle) => (
                        <option key={cycle} value={cycle}>{cycleLabel(cycle)} and longer</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </fieldset>
          )}

          {type === "DOMAIN" ? (
            <p className={styles.note}>Domain pricing comes from Admin / Domain Prices. The product price shows "from" the cheapest TLD.</p>
          ) : (
            <fieldset className={styles.fieldset}>
              <legend>Pricing (EUR)</legend>
              <div className={styles.priceGrid}>
                {["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "YEAR_1", "YEAR_2", "YEAR_3", "YEAR_4"].map((cycle) => (
                  <label key={cycle}>
                    <span className={styles.cycleLabel}>{cycleLabel(cycle)}</span>
                    <input defaultValue={priceValue(editing, cycle)} name={`price_${cycle}`} placeholder="—" />
                  </label>
                ))}
                <label>
                  <span className={styles.cycleLabel}>Setup Fee</span>
                  <input name="setupFee" placeholder="0" />
                </label>
              </div>
            </fieldset>
          )}

          {effectiveModule === "virtualmin" ? (
            <fieldset className={styles.fieldset}>
              <legend>Virtualmin</legend>
              <div className={styles.virtualminRow}>
                <label className={styles.flexGrow}>
                  Plan
                  <select defaultValue={String(editing?.configs?.find((c) => c.key === "virtualmin_plan")?.values?.[0] ?? "")} name="virtualminPlan" onChange={(e) => setSelectedPlan(e.target.value)}>
                    <option value="">Select plan</option>
                    {virtualmin.plans.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </label>
                <Button size="sm" type="button" variant="secondary" onClick={detectVirtualminPlans}>Detect plans</Button>
              </div>
              {plan ? (
                <div className={styles.limits}>
                  <span>Disk: {plan.limits?.disk ?? "?"}</span>
                  <span>Bandwidth: {plan.limits?.bandwidth ?? "?"}</span>
                  <span>Email: {plan.limits?.mailboxes ?? "?"}</span>
                  <span>Databases: {plan.limits?.databases ?? "?"}</span>
                  <span>Subdomains: {plan.limits?.subServers ?? "?"}</span>
                </div>
              ) : null}
            </fieldset>
          ) : null}

          <div className={styles.formActions}>
            <Button size="sm" type="submit">Save Product</Button>
            {state.message ? <span className={styles[state.kind]}>{state.message}</span> : null}
          </div>
        </form>
      </section>

      {detectedPlans.length > 0 ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Detected Virtualmin Plans</h2>
            <Button size="sm" type="button" onClick={syncVirtualminPlans}>Confirm &amp; Save</Button>
          </div>
          <div className={styles.planReview}>
            {detectedPlans.map((p) => (
              <article key={p.id}>
                <strong>{p.name}</strong>
                <span className={styles.muted}>ID: {p.id}</span>
                <ul>
                  {(p.differences ?? []).map((item) => <li key={item.key}>{item.label}: {item.value}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className={styles.vmRow}>
          <Button size="sm" type="button" variant="secondary" onClick={detectVirtualminPlans}>Detect Virtualmin plans</Button>
        </div>
      )}

      <section className={styles.card}>
        <div className={styles.cardHeader}><h2>Products</h2></div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Type</th>
                <th>Category</th>
                <th>Module</th>
                <th>Domain</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td className={styles.muted}>{product.sortOrder ?? 0}</td>
                  <td>{product.name}</td>
                  <td>{typeLabel(product.type)}</td>
                  <td>{product.category?.name ?? <span className={styles.muted}>—</span>}</td>
                  <td>{moduleLabel(product.category ? product.category.provisioningModule : product.provisioningModule)}</td>
                  <td>{product.type === "DOMAIN" ? <span className={styles.muted}>—</span> : domainRequirementLabel(product.domainRequirement)}</td>
                  <td className={styles.rowActions}>
                    <Button size="sm" type="button" variant="secondary" onClick={() => editProduct(product)}>Edit</Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => removeProduct(product)}>Remove</Button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={7} className={styles.empty}>No products yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function cents(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  return Math.round(Number(raw.replace(",", ".")) * 100);
}

function customFields(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => ({
      key: f.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: f,
      required: false,
      values: []
    }));
}

function customFieldsValue(product?: ApiProduct) {
  return (product?.configs ?? [])
    .filter((c) => !["virtualmin_plan", "virtualmin_template", "disk_space", "bandwidth", "databases", "mailboxes", "subdomains"].includes(c.key))
    .map((c) => c.label)
    .join(", ");
}

function virtualminFields(formData: FormData) {
  if (String(formData.get("categoryModule") ?? "") !== "virtualmin") return [];
  return [
    { key: "virtualmin_plan", label: "Virtualmin Plan", required: true, values: [String(formData.get("virtualminPlan") ?? "")] }
  ];
}

function preservedConfigs(product?: ApiProduct) {
  return (product?.configs ?? []).filter((c) => !["virtualmin_plan", "virtualmin_template"].includes(c.key));
}

function priceValue(product: ApiProduct | undefined, cycle: string) {
  const price = product?.prices.find((item) => item.billingCycle === cycle);
  return price ? String(price.amountCents / 100).replace(".", ",") : "";
}

function cycleLabel(cycle: string) {
  const map: Record<string, string> = {
    MONTHLY: "Monthly",
    QUARTERLY: "Quarterly",
    SEMI_ANNUAL: "Semi-annual",
    YEAR_1: "1 Year",
    YEAR_2: "2 Years",
    YEAR_3: "3 Years",
    YEAR_4: "4 Years"
  };
  return map[cycle] ?? cycle;
}

function typeLabel(type: string) {
  return {
    DOMAIN: "Domain",
    SHARED_HOSTING: "Web Hosting",
    VPS: "VPS"
  }[type] ?? type.toLowerCase().replace(/_/g, " ");
}

function domainRequirementLabel(requirement?: string | null) {
  return {
    NECESSARY: "Necessary",
    OPTIONAL: "Optional",
    NOT_NEEDED: "Not needed"
  }[requirement ?? "NOT_NEEDED"] ?? "Not needed";
}

function moduleLabel(moduleName?: string | null) {
  if (!moduleName || moduleName === "none") return "Manual";
  return moduleName === "resellbiz" ? "ResellBiz" : moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
}
