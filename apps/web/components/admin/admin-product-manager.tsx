"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, type ApiProduct, type ApiProductCategory } from "@teculiar/web-core/lib/api";
import { useLocale } from "@teculiar/web-core/components/layout/locale-provider";
import { getDictionary, type Dictionary } from "@teculiar/web-core/lib/dictionary";
import { Button } from "@teculiar/web-core/components/ui/button";
import { notify } from "@teculiar/web-core/components/ui/toast-provider";
import styles from "./admin-product-manager.module.css";

type ProductsDict = Dictionary["admin"]["productMgr"];

type FormState = { kind: "idle" | "loading" | "ok" | "error"; message?: string };
type VirtualminOption = {
  differences?: Array<{ key: string; label: string; value: string }>;
  id: string;
  limits?: { bandwidth?: string; databases?: string; disk?: string; mailboxes?: string; subServers?: string };
  name: string;
};

export function AdminCategoryManager() {
  const c = getDictionary(useLocale()).admin.productMgr;
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
    setState({ kind: "loading", message: c.savingCategory });
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
      const message = typeof payload.message === "string" ? payload.message : c.categorySaveFailed;
      setState({ kind: "error", message });
      notify.error(message);
      return;
    }
    setState({ kind: "ok", message: c.categorySaved });
    notify.success(c.categorySaved);
    setEditingCategory(undefined);
    await refreshCategories();
  }

  async function removeCategory(category: ApiProductCategory) {
    setState({ kind: "loading", message: c.removingCategory });
    const response = await fetch(`${API_BASE_URL}/admin/dev/product-categories/${category.id}`, { headers: authHeaders(), method: "DELETE" });
    if (!response.ok) {
      setState({ kind: "error", message: c.categoryRemoveFailed });
      notify.error(c.categoryRemoveFailed);
      return;
    }
    setState({ kind: "ok", message: c.categoryRemoved });
    notify.success(c.categoryRemoved);
    await refreshCategories();
  }

  return (
    <div className={styles.stack}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>{editingCategory ? `${c.editPrefix} ${editingCategory.name}` : c.newCategory}</h2>
        </div>
        <form action={saveCategory} className={styles.form} key={editingCategory?.id ?? "new-category"}>
          <input name="categoryId" type="hidden" value={editingCategory?.id ?? ""} />
          <div className={styles.grid}>
            <label>{c.name}<input defaultValue={editingCategory?.name ?? ""} name="categoryName" required placeholder="Web Hosting" /></label>
            <label>{c.slug}<input defaultValue={editingCategory?.slug ?? ""} name="categorySlug" required placeholder="webhosting" /></label>
            <label>
              {c.module}
              <select defaultValue={editingCategory?.provisioningModule ?? "none"} name="categoryModule">
                <option value="virtualmin">{c.virtualmin}</option>
                <option value="resellbiz">{c.resellbiz}</option>
                <option value="hetzner">{c.hetzner}</option>
                <option value="none">{c.manual}</option>
              </select>
            </label>
            <label>{c.sortOrder}<input defaultValue={editingCategory?.sortOrder ?? 0} name="categorySortOrder" type="number" min="0" /></label>
          </div>
          <label>{c.description}<textarea defaultValue={editingCategory?.description ?? ""} name="categoryDescription" rows={2} /></label>
          <div className={styles.formActions}>
            <Button size="sm" type="submit">{c.saveCategory}</Button>
            {editingCategory ? <Button size="sm" type="button" variant="secondary" onClick={() => setEditingCategory(undefined)}>{c.newCategory}</Button> : null}
            {state.message ? <span className={styles[state.kind]}>{state.message}</span> : null}
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}><h2>{c.categories}</h2></div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{c.name}</th>
                <th>{c.slug}</th>
                <th>{c.module}</th>
                <th>{c.colProducts}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td className={styles.muted}>{category.sortOrder ?? 0}</td>
                  <td>{category.name}</td>
                  <td className={styles.mono}>{category.slug}</td>
                  <td>{moduleLabel(category.provisioningModule, c)}</td>
                  <td>{category.products?.length ?? 0}</td>
                  <td className={styles.rowActions}>
                    <Button size="sm" type="button" variant="secondary" onClick={() => setEditingCategory(category)}>{c.edit}</Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => removeCategory(category)}>{c.remove}</Button>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && <tr><td colSpan={6} className={styles.empty}>{c.noCategories}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function AdminProductManager() {
  const c = getDictionary(useLocale()).admin.productMgr;
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
    setState({ kind: "loading", message: c.savingProduct });
    notify.info(c.savingProduct);
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
          featured: formData.get("featured") === "on",
          name: String(formData.get("name") ?? ""),
          prices,
          provisioningModule: String(formData.get("provisioningModule") ?? "none"),
          slug: String(formData.get("slug") ?? ""),
          sortOrder: Number(formData.get("sortOrder") ?? 0),
          type: String(formData.get("type") ?? "DOMAIN")
        }),
        headers: { "Content-Type": "application/json", ...authHeaders() },
        method: productId ? "PATCH" : "POST"
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.message === "string" ? payload.message : c.productSaveFailed);
      }

      setState({ kind: "ok", message: c.productSaved });
      notify.success(c.productSaved);
      setEditing(undefined);
      setCategoryId("");
      await refreshProducts();
    } catch (error) {
      const message = error instanceof Error ? error.message : c.productSaveFailedShort;
      setState({ kind: "error", message });
      notify.error(message);
    }
  }

  async function removeProduct(product: ApiProduct) {
    if (!confirm(c.removeProductConfirm.replace("{name}", product.name))) return;
    setState({ kind: "loading", message: c.removingProduct });
    const response = await fetch(`${API_BASE_URL}/admin/dev/products/${product.id}`, { headers: authHeaders(), method: "DELETE" });
    if (!response.ok) {
      setState({ kind: "error", message: c.productRemoveFailed });
      notify.error(c.productRemoveFailed);
      return;
    }
    setState({ kind: "ok", message: c.productRemoved });
    notify.success(c.productRemoved);
    await refreshProducts();
  }

  function editProduct(product: ApiProduct) {
    setEditing(product);
    setCategoryId(product.categoryId ?? product.category?.id ?? "");
    // Product-first (Phase 6.2): the product's own module wins; category is only the default.
    setModule(product.provisioningModule ?? product.category?.provisioningModule ?? "none");
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
      notify.success(c.vmDetected);
    } else {
      notify.error(c.vmDetectFailed);
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
      notify.success(c.vmSaved);
    } else {
      notify.error(c.vmSyncFailed);
    }
    await refreshProducts();
  }

  const plan = virtualmin.plans.find((option) => option.id === selectedPlan);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  // Product-first: the select below is authoritative; picking a category only prefills it.
  const effectiveModule = module;
  // Domain products are the domain itself, and a "domain" category groups them — neither gets the
  // can-be-ordered-with-a-domain controls.
  const isDomainProduct = type === "DOMAIN" || /domain/i.test(selectedCategory?.slug ?? "") || /domain/i.test(selectedCategory?.name ?? "");
  const canOrderWithDomain = !isDomainProduct && domainRequirement !== "NOT_NEEDED";

  return (
    <div className={styles.stack}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>{editing ? `${c.editPrefix} ${editing.name}` : c.newProduct}</h2>
          {editing ? (
            <Button size="sm" type="button" variant="secondary" onClick={() => { setEditing(undefined); setCategoryId(""); setType("DOMAIN"); setDomainRequirement("NOT_NEEDED"); setFreeDomainCycle(""); }}>
              {c.newProduct}
            </Button>
          ) : null}
        </div>

        <form action={submit} className={styles.form} key={editing?.id ?? "new"}>
          <input name="productId" type="hidden" value={editing?.id ?? ""} />
          <input name="categoryModule" type="hidden" value={effectiveModule ?? "none"} />
          <input name="domainRequirement" type="hidden" value={isDomainProduct ? "NOT_NEEDED" : domainRequirement} />
          <input name="freeDomainBillingCycle" type="hidden" value={canOrderWithDomain ? freeDomainCycle : ""} />

          <fieldset className={styles.fieldset}>
            <legend>{c.basicInfo}</legend>
            <div className={styles.grid}>
              <label>{c.name}<input defaultValue={editing?.name ?? ""} name="name" required placeholder="Web Hosting Basic" /></label>
              <label>{c.slug}<input defaultValue={editing?.slug ?? ""} name="slug" required placeholder="web-hosting-basic" /></label>
              <label>
                {c.type}
                <select defaultValue={editing?.type ?? "DOMAIN"} name="type" onChange={(e) => setType(e.target.value)}>
                  <option value="DOMAIN">{c.typeDomain}</option>
                  <option value="SHARED_HOSTING">{c.typeWebHosting}</option>
                  <option value="VPS">{c.typeVps}</option>
                </select>
              </label>
              <label>
                {c.category}
                <select defaultValue={editing?.categoryId ?? editing?.category?.id ?? ""} name="categoryId" onChange={(e) => {
                  const nextCategory = categories.find((cat) => cat.id === e.target.value);
                  setCategoryId(e.target.value);
                  setModule(nextCategory?.provisioningModule ?? "none");
                }}>
                  <option value="">{c.noCategory}</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </label>
              <label>
                {c.module}
                <select name="provisioningModule" value={module} onChange={(e) => setModule(e.target.value)}>
                  <option value="virtualmin">{c.virtualmin}</option>
                  <option value="resellbiz">{c.resellbiz}</option>
                  <option value="hetzner">{c.hetzner}</option>
                  <option value="none">{c.manual}</option>
                </select>
              </label>
              <label>{c.sortOrder}<input defaultValue={editing?.sortOrder ?? 0} name="sortOrder" type="number" min="0" placeholder="0" /></label>
              <label>{c.customFields}<input defaultValue={customFieldsValue(editing)} name="customFields" placeholder="Hostname, PHP Version" /></label>
              <label className={styles.checkboxRow}>
                <input defaultChecked={editing?.featured ?? false} name="featured" type="checkbox" />
                {c.featuredBadge}
              </label>
            </div>
            <label>{c.description}<textarea defaultValue={editing?.description ?? ""} name="description" required rows={3} /></label>
          </fieldset>

          {isDomainProduct ? null : (
            <fieldset className={styles.fieldset}>
              <legend>{c.domain}</legend>
              <label className={styles.checkboxRow}>
                <input
                  checked={canOrderWithDomain}
                  onChange={(e) => setDomainRequirement(e.target.checked ? "NECESSARY" : "NOT_NEEDED")}
                  type="checkbox"
                />
                {c.canOrderWithDomain}
              </label>
              {canOrderWithDomain ? (
                <div className={styles.grid}>
                  <label>
                    {c.domainRequirement}
                    <select value={domainRequirement} onChange={(e) => setDomainRequirement(e.target.value)}>
                      <option value="NECESSARY">{c.reqNecessary}</option>
                      <option value="OPTIONAL">{c.reqOptional}</option>
                    </select>
                  </label>
                  <label>
                    {c.freeDomainIncluded}
                    <select value={freeDomainCycle} onChange={(e) => setFreeDomainCycle(e.target.value)}>
                      <option value="">{c.noFreeDomain}</option>
                      {["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "YEAR_1", "YEAR_2", "YEAR_3", "YEAR_4"].map((cycle) => (
                        <option key={cycle} value={cycle}>{c.andLonger.replace("{cycle}", cycleLabel(cycle, c))}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </fieldset>
          )}

          {type === "DOMAIN" ? (
            <p className={styles.note}>{c.domainPricingNote}</p>
          ) : (
            <fieldset className={styles.fieldset}>
              <legend>{c.pricingEur}</legend>
              <div className={styles.priceGrid}>
                {["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "YEAR_1", "YEAR_2", "YEAR_3", "YEAR_4"].map((cycle) => (
                  <label key={cycle}>
                    <span className={styles.cycleLabel}>{cycleLabel(cycle, c)}</span>
                    <input defaultValue={priceValue(editing, cycle)} name={`price_${cycle}`} placeholder="—" />
                  </label>
                ))}
                <label>
                  <span className={styles.cycleLabel}>{c.setupFee}</span>
                  <input name="setupFee" placeholder="0" />
                </label>
              </div>
            </fieldset>
          )}

          {effectiveModule === "virtualmin" ? (
            <fieldset className={styles.fieldset}>
              <legend>{c.virtualmin}</legend>
              <div className={styles.virtualminRow}>
                <label className={styles.flexGrow}>
                  {c.plan}
                  <select defaultValue={String(editing?.configs?.find((cfg) => cfg.key === "virtualmin_plan")?.values?.[0] ?? "")} name="virtualminPlan" onChange={(e) => setSelectedPlan(e.target.value)}>
                    <option value="">{c.selectPlan}</option>
                    {virtualmin.plans.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </label>
                <Button size="sm" type="button" variant="secondary" onClick={detectVirtualminPlans}>{c.detectPlans}</Button>
              </div>
              {plan ? (
                <div className={styles.limits}>
                  <span>{c.disk}: {plan.limits?.disk ?? "?"}</span>
                  <span>{c.bandwidth}: {plan.limits?.bandwidth ?? "?"}</span>
                  <span>{c.email}: {plan.limits?.mailboxes ?? "?"}</span>
                  <span>{c.databases}: {plan.limits?.databases ?? "?"}</span>
                  <span>{c.subdomains}: {plan.limits?.subServers ?? "?"}</span>
                </div>
              ) : null}
            </fieldset>
          ) : null}

          <div className={styles.formActions}>
            <Button size="sm" type="submit">{c.saveProduct}</Button>
            {state.message ? <span className={styles[state.kind]}>{state.message}</span> : null}
          </div>
        </form>
      </section>

      {detectedPlans.length > 0 ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>{c.detectedPlans}</h2>
            <Button size="sm" type="button" onClick={syncVirtualminPlans}>{c.confirmSave}</Button>
          </div>
          <div className={styles.planReview}>
            {detectedPlans.map((p) => (
              <article key={p.id}>
                <strong>{p.name}</strong>
                <span className={styles.muted}>{c.idLabel} {p.id}</span>
                <ul>
                  {(p.differences ?? []).map((item) => <li key={item.key}>{item.label}: {item.value}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className={styles.vmRow}>
          <Button size="sm" type="button" variant="secondary" onClick={detectVirtualminPlans}>{c.detectVmPlans}</Button>
        </div>
      )}

      <section className={styles.card}>
        <div className={styles.cardHeader}><h2>{c.products}</h2></div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{c.name}</th>
                <th>{c.colType}</th>
                <th>{c.colCategory}</th>
                <th>{c.module}</th>
                <th>{c.colDomain}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td className={styles.muted}>{product.sortOrder ?? 0}</td>
                  <td>{product.name}</td>
                  <td>{typeLabel(product.type, c)}</td>
                  <td>{product.category?.name ?? <span className={styles.muted}>—</span>}</td>
                  <td>{moduleLabel(product.provisioningModule ?? product.category?.provisioningModule, c)}</td>
                  <td>{product.type === "DOMAIN" ? <span className={styles.muted}>—</span> : domainRequirementLabel(product.domainRequirement, c)}</td>
                  <td className={styles.rowActions}>
                    <Button size="sm" type="button" variant="secondary" onClick={() => editProduct(product)}>{c.edit}</Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => removeProduct(product)}>{c.remove}</Button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={7} className={styles.empty}>{c.noProducts}</td></tr>}
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

function cycleLabel(cycle: string, c: ProductsDict) {
  const map: Record<string, string> = {
    MONTHLY: c.cycleMonthly,
    QUARTERLY: c.cycleQuarterly,
    SEMI_ANNUAL: c.cycleSemiAnnual,
    YEAR_1: c.cycleYear1,
    YEAR_2: c.cycleYear2,
    YEAR_3: c.cycleYear3,
    YEAR_4: c.cycleYear4
  };
  return map[cycle] ?? cycle;
}

function typeLabel(type: string, c: ProductsDict) {
  return {
    DOMAIN: c.typeDomain,
    SHARED_HOSTING: c.typeWebHosting,
    VPS: c.typeVps
  }[type] ?? type.toLowerCase().replace(/_/g, " ");
}

function domainRequirementLabel(requirement: string | null | undefined, c: ProductsDict) {
  return {
    NECESSARY: c.reqNecessaryShort,
    OPTIONAL: c.reqOptionalShort,
    NOT_NEEDED: c.reqNotNeeded
  }[requirement ?? "NOT_NEEDED"] ?? c.reqNotNeeded;
}

function moduleLabel(moduleName: string | null | undefined, c: ProductsDict) {
  if (!moduleName || moduleName === "none") return c.manual;
  return moduleName === "resellbiz" ? c.resellbiz : moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
}
