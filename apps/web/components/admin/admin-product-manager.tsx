"use client";

import { useState } from "react";
import { API_BASE_URL } from "../../lib/api";
import { Button } from "../ui/button";
import styles from "./admin-product-manager.module.css";

type FormState = { kind: "idle" | "loading" | "ok" | "error"; message?: string };

export function AdminProductManager() {
  const [state, setState] = useState<FormState>({ kind: "idle" });

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
      const response = await fetch(`${API_BASE_URL}/admin/dev/products`, {
        body: JSON.stringify({
          configurableOptions: customFields(formData.get("customFields")),
          description: String(formData.get("description") ?? ""),
          homepageVisible: formData.get("homepageVisible") === "on",
          name: String(formData.get("name") ?? ""),
          prices,
          provisioningModule: String(formData.get("provisioningModule") ?? ""),
          slug: String(formData.get("slug") ?? ""),
          type: String(formData.get("type") ?? "DOMAIN")
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.message === "string" ? payload.message : "Produkt konnte nicht gespeichert werden.");
      }

      setState({ kind: "ok", message: "Produkt gespeichert. Es erscheint auf der Homepage." });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Produkt fehlgeschlagen." });
    }
  }

  return (
    <form action={submit} className={styles.form}>
      <div className={styles.grid}>
        <label>
          Name
          <input name="name" required placeholder="Domain .de" />
        </label>
        <label>
          Slug
          <input name="slug" required placeholder="domain-de" />
        </label>
        <label>
          Typ
          <select name="type">
            <option value="DOMAIN">Domain</option>
            <option value="SHARED_HOSTING">Web Hosting</option>
            <option value="VPS">VPS</option>
          </select>
        </label>
        <label>
          Modul
          <select name="provisioningModule">
            <option value="resellbiz">ResellBiz</option>
            <option value="none">Kein API</option>
          </select>
        </label>
        {["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "YEAR_1", "YEAR_2", "YEAR_3", "YEAR_4"].map((cycle) => (
          <label key={cycle}>
            {cycle} EUR
            <input name={`price_${cycle}`} placeholder="9.90" />
          </label>
        ))}
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
        <textarea name="description" required rows={3} />
      </label>
      <label className={styles.check}>
        <input defaultChecked name="homepageVisible" type="checkbox" />
        Auf Homepage zeigen
      </label>
      <Button type="submit">Produkt speichern</Button>
      {state.message ? <p className={styles[state.kind]}>{state.message}</p> : null}
    </form>
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
