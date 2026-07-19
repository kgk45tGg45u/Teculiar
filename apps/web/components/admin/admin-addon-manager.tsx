"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, authHeaders, money, type ApiAddOn, type ApiProduct } from "@teculiar/web-core/lib/api";
import { useLocale } from "@teculiar/web-core/components/layout/locale-provider";
import { getDictionary, type Dictionary } from "@teculiar/web-core/lib/dictionary";
import { Button } from "@teculiar/web-core/components/ui/button";
import { notify } from "@teculiar/web-core/components/ui/toast-provider";
import { TranslateField } from "./theme/translate-field";
import type { LocaleMap } from "./theme/types";
import styles from "./admin-product-manager.module.css";

type AddOnRow = ApiAddOn & { productLinks?: Array<{ productId: string }> };
type AddonDict = Dictionary["admin"]["addonMgr"];
type FormState = { kind: "idle" | "loading" | "ok" | "error"; message?: string };

const CYCLES = ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "YEAR_1", "YEAR_2", "YEAR_3", "YEAR_4", "ONE_TIME"];

export function AdminAddOnManager() {
  const locale = useLocale();
  const dict = getDictionary(locale).admin;
  const c = dict.addonMgr;
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [addOns, setAddOns] = useState<AddOnRow[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [locales, setLocales] = useState<string[]>(["de", "en"]);
  const [editing, setEditing] = useState<AddOnRow | undefined>();
  const [nameMap, setNameMap] = useState<LocaleMap>({});
  const [descriptionMap, setDescriptionMap] = useState<LocaleMap>({});
  const [productIds, setProductIds] = useState<string[]>([]);

  const mainLocale = locales[0] ?? "de";
  const adminLocale = locales.includes(locale) ? locale : mainLocale;
  const canTranslate = locales.length > 1;

  useEffect(() => {
    void refresh();
    void fetch(`${API_BASE_URL}/products`)
      .then((response) => response.json())
      .then((payload) => setProducts(Array.isArray(payload) ? payload.filter((product: ApiProduct) => product.type !== "DOMAIN") : []))
      .catch(() => undefined);
    void fetch(`${API_BASE_URL}/admin/dev/billing/settings`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((payload: { languages?: { main?: string; others?: string[] } }) => {
        if (payload.languages?.main) {
          setLocales([payload.languages.main, ...(payload.languages.others ?? [])]);
        }
      })
      .catch(() => undefined);
  }, []);

  async function refresh() {
    const response = await fetch(`${API_BASE_URL}/admin/dev/addons`, { headers: authHeaders() });
    const payload = await response.json().catch(() => []);
    setAddOns(Array.isArray(payload) ? payload : []);
  }

  function editAddOn(addOn: AddOnRow) {
    setEditing(addOn);
    setNameMap({ ...(addOn.nameTranslations ?? {}), [mainLocale]: addOn.name });
    setDescriptionMap({ ...(addOn.descriptionTranslations ?? {}), [mainLocale]: addOn.description ?? "" });
    setProductIds((addOn.productLinks ?? []).map((link) => link.productId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditing(undefined);
    setNameMap({});
    setDescriptionMap({});
    setProductIds([]);
  }

  async function submit(formData: FormData) {
    const name = (nameMap[mainLocale] ?? "").trim();
    if (!name) {
      notify.error(c.nameRequired);
      setState({ kind: "error", message: c.nameRequired });
      return;
    }
    setState({ kind: "loading", message: c.saving });
    const addOnId = String(formData.get("addOnId") ?? "");
    const response = await fetch(`${API_BASE_URL}/admin/dev/addons${addOnId ? `/${addOnId}` : ""}`, {
      body: JSON.stringify({
        active: formData.get("active") === "on",
        amountCents: cents(formData.get("amountEur")) ?? 0,
        billingCycle: String(formData.get("billingCycle") ?? ""),
        description: (descriptionMap[mainLocale] ?? "").trim(),
        descriptionTranslations: descriptionMap,
        name,
        nameTranslations: nameMap,
        productIds,
        recurring: formData.get("recurring") === "on",
        setupFeeCents: cents(formData.get("setupFeeEur")) ?? 0,
        slug: String(formData.get("slug") ?? "")
      }),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      method: addOnId ? "PATCH" : "POST"
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = typeof payload.message === "string" ? payload.message : c.saveFailed;
      setState({ kind: "error", message });
      notify.error(message);
      return;
    }
    setState({ kind: "ok", message: c.saved });
    notify.success(c.saved);
    resetForm();
    await refresh();
  }

  async function removeAddOn(addOn: AddOnRow) {
    if (!confirm(c.removeConfirm.replace("{name}", addOn.name))) return;
    const response = await fetch(`${API_BASE_URL}/admin/dev/addons/${addOn.id}`, { headers: authHeaders(), method: "DELETE" });
    if (!response.ok) {
      notify.error(c.removeFailed);
      return;
    }
    notify.success(c.removed);
    await refresh();
  }

  const translateProps = useMemo(
    () => ({ locales, adminLocale, canTranslate, translationsLabel: c.translations, doneLabel: c.done }),
    [adminLocale, c.done, c.translations, canTranslate, locales]
  );

  return (
    <div className={styles.stack}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>{editing ? `${c.editPrefix} ${editing.name}` : c.newAddOn}</h2>
          {editing ? <Button size="sm" type="button" variant="secondary" onClick={resetForm}>{c.newAddOn}</Button> : null}
        </div>
        <form action={submit} className={styles.form} key={editing?.id ?? "new-addon"}>
          <input name="addOnId" type="hidden" value={editing?.id ?? ""} />
          <div className={styles.grid}>
            <label>
              {c.name}
              <TranslateField modalTitle={c.name} onChange={setNameMap} placeholder="Nextcloud Server Setup" value={nameMap} {...translateProps} />
            </label>
            <label>{c.slug}<input defaultValue={editing?.slug ?? ""} name="slug" required placeholder="nextcloud-setup" /></label>
            <label>{c.priceEur}<input defaultValue={eur(editing?.amountCents)} name="amountEur" required placeholder="9,90" /></label>
            <label>{c.setupFeeEur}<input defaultValue={eur(editing?.setupFeeCents)} name="setupFeeEur" placeholder="0" /></label>
            <label>
              {c.billingCycle}
              <select defaultValue={editing?.billingCycle ?? ""} name="billingCycle">
                <option value="">{c.followsProduct}</option>
                {CYCLES.map((cycle) => <option key={cycle} value={cycle}>{cycleLabel(cycle, dict.productMgr, c)}</option>)}
              </select>
            </label>
            <label className={styles.checkboxRow}>
              <input defaultChecked={editing?.recurring ?? true} name="recurring" type="checkbox" />
              {c.recurring}
            </label>
            <label className={styles.checkboxRow}>
              <input defaultChecked={editing?.active ?? true} name="active" type="checkbox" />
              {c.active}
            </label>
          </div>
          <label>
            {c.description}
            <TranslateField modalTitle={c.description} multiline onChange={setDescriptionMap} value={descriptionMap} {...translateProps} />
          </label>
          <fieldset className={styles.fieldset}>
            <legend>{c.products}</legend>
            <div className={styles.grid}>
              {products.map((product) => (
                <label className={styles.checkboxRow} key={product.id}>
                  <input
                    checked={productIds.includes(product.id)}
                    onChange={(event) =>
                      setProductIds((ids) => (event.target.checked ? [...ids, product.id] : ids.filter((id) => id !== product.id)))
                    }
                    type="checkbox"
                  />
                  {product.name}
                </label>
              ))}
              {products.length === 0 ? <span className={styles.muted}>{c.noProducts}</span> : null}
            </div>
          </fieldset>
          <div className={styles.formActions}>
            <Button size="sm" type="submit">{c.save}</Button>
            {state.message ? <span className={styles[state.kind]}>{state.message}</span> : null}
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}><h2>{c.title}</h2></div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{c.name}</th>
                <th>{c.colPrice}</th>
                <th>{c.billingCycle}</th>
                <th>{c.recurring}</th>
                <th>{c.products}</th>
                <th>{c.active}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {addOns.map((addOn) => (
                <tr key={addOn.id}>
                  <td>{addOn.name}</td>
                  <td>
                    {money(addOn.amountCents, "EUR", locale)}
                    {(addOn.setupFeeCents ?? 0) > 0 ? <span className={styles.muted}> + {money(addOn.setupFeeCents ?? 0, "EUR", locale)}</span> : null}
                  </td>
                  <td>{addOn.billingCycle ? cycleLabel(addOn.billingCycle, dict.productMgr, c) : c.followsProduct}</td>
                  <td>{addOn.recurring ? c.yes : c.no}</td>
                  <td>{addOn.productLinks?.length ?? 0}</td>
                  <td>{addOn.active === false ? c.no : c.yes}</td>
                  <td className={styles.rowActions}>
                    <Button size="sm" type="button" variant="secondary" onClick={() => editAddOn(addOn)}>{dict.productMgr.edit}</Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => removeAddOn(addOn)}>{dict.productMgr.remove}</Button>
                  </td>
                </tr>
              ))}
              {addOns.length === 0 && <tr><td colSpan={7} className={styles.empty}>{c.noAddOns}</td></tr>}
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
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

function eur(amountCents?: number) {
  return amountCents ? String(amountCents / 100).replace(".", ",") : "";
}

function cycleLabel(cycle: string, pm: Dictionary["admin"]["productMgr"], c: AddonDict) {
  const map: Record<string, string> = {
    MONTHLY: pm.cycleMonthly,
    QUARTERLY: pm.cycleQuarterly,
    SEMI_ANNUAL: pm.cycleSemiAnnual,
    YEAR_1: pm.cycleYear1,
    YEAR_2: pm.cycleYear2,
    YEAR_3: pm.cycleYear3,
    YEAR_4: pm.cycleYear4,
    ONE_TIME: c.oneTime
  };
  return map[cycle] ?? cycle;
}
