import { notFound } from "next/navigation";
import { Download, ExternalLink, Pencil, Plus, RefreshCw, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@teculiar/web-core/components/ui/button";
import { Badge } from "@teculiar/web-core/components/ui/badge";
import { StatusBadge } from "@teculiar/web-core/components/ui/status-badge";
import { Field, Input, Select, Textarea } from "@teculiar/web-core/components/ui/form-controls";
import { UiLabDataTable, UiLabListTable } from "./ui-lab-table";
import styles from "./ui-lab.module.css";

// Internal dev-only styleguide for the D1 design system (docs/design-system.md).
// English-only on purpose; hidden in production, excluded from locale packages.
const COLORS = [
  ["--bg", "#eef3f8"],
  ["--surface", "#ffffff"],
  ["--surface-muted", "#e5edf5"],
  ["--primary", "#071a2f"],
  ["--accent", "#0077b6"],
  ["--accent-soft", "#d8f1ff"],
  ["--success", "#087443"],
  ["--warning", "#9a5b00"],
  ["--danger", "#b42318"],
  ["--border", "#b9c7d6"]
];

const TYPE_SCALE: Array<[string, string]> = [
  ["--text-2xl", "24px — page hero (rare)"],
  ["--text-xl", "20px — page title (H1)"],
  ["--text-lg", "16px — section title"],
  ["--text-md", "14px — body"],
  ["--text-sm", "13px — table cells, secondary"],
  ["--text-xs", "12px — labels, captions"]
];

export default function UiLabPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="container">
      <div className={styles.lab}>
        <div className="page-header">
          <div>
            <h1>UI Lab</h1>
            <p>D1 design-system checkpoint page. Dev-only — returns 404 in production.</p>
          </div>
        </div>

        <section className={`panel ${styles.section}`} style={{ padding: 18 }}>
          <h2>Tokens</h2>
          <h3>Colors</h3>
          <div className={styles.swatches}>
            {COLORS.map(([name, hex]) => (
              <div key={name} className={styles.swatch}>
                <i style={{ background: `var(${name})` }} />
                <code>{name}</code>
                <code>{hex}</code>
              </div>
            ))}
          </div>
          <h3>Type scale (compact)</h3>
          <div className={styles.typeScale}>
            {TYPE_SCALE.map(([token, label]) => (
              <span key={token} style={{ fontSize: `var(${token})` }}>
                {label}
              </span>
            ))}
          </div>
          <h3>Radius</h3>
          <div className={`${styles.row} ${styles.radiusRow}`}>
            <i style={{ borderRadius: "var(--radius-control)" }} title="control 6px" />
            <i style={{ borderRadius: "var(--radius-surface)" }} title="surface 8px" />
            <i style={{ borderRadius: "var(--radius-pill)" }} title="pill" />
            <span className="muted-text" style={{ fontSize: "var(--text-xs)" }}>
              control 6px · surface 8px · pill 999px
            </span>
          </div>
        </section>

        <section className={`panel ${styles.section}`} style={{ padding: 18 }}>
          <h2>Buttons</h2>
          <h3>Variants (md)</h3>
          <div className={styles.row}>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <h3>Small</h3>
          <div className={styles.row}>
            <Button size="sm">Primary</Button>
            <Button size="sm" variant="secondary">Secondary</Button>
            <Button size="sm" variant="ghost">Ghost</Button>
            <Button size="sm" variant="danger">Danger</Button>
          </div>
          <h3>With icon (md)</h3>
          <div className={styles.row}>
            <Button icon={Plus}>New client</Button>
            <Button icon={Download} variant="secondary">Export CSV</Button>
            <Button icon={RefreshCw} variant="ghost">Refresh</Button>
            <Button icon={Trash2} variant="danger">Delete</Button>
          </div>
          <h3>With icon (sm)</h3>
          <div className={styles.row}>
            <Button icon={Plus} size="sm">Add row</Button>
            <Button icon={Pencil} variant="secondary" size="sm">Edit</Button>
            <Button icon={Send} variant="ghost" size="sm">Resend</Button>
            <Button icon={Trash2} variant="danger" size="sm">Delete</Button>
          </div>
          <h3>Disabled / as link</h3>
          <div className={styles.row}>
            <Button disabled>Disabled</Button>
            <Button variant="secondary" disabled>Disabled</Button>
            <Button icon={Plus} disabled>Disabled icon</Button>
            <Button href="/admin" variant="secondary" icon={ExternalLink}>Link button</Button>
          </div>
          <h3>In context: table row actions / form footer</h3>
          <div className={styles.row}>
            <span className="muted-text" style={{ fontSize: "var(--text-sm)" }}>invoice-2041.pdf</span>
            <Button size="sm" variant="secondary" icon={Download}>Download</Button>
            <Button size="sm" variant="ghost" icon={Pencil}>Edit</Button>
            <Button size="sm" variant="danger" icon={Trash2}>Delete</Button>
          </div>
          <div className={styles.row} style={{ justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <Button variant="ghost">Cancel</Button>
            <Button icon={Save}>Save changes</Button>
          </div>
        </section>

        <section className={`panel ${styles.section}`} style={{ padding: 18 }}>
          <h2>Form controls</h2>
          <div className={styles.formGrid}>
            <Field label="Email">
              <Input type="email" placeholder="name@example.com" />
            </Field>
            <Field label="Status" hint="Hint text under the field">
              <Select defaultValue="active">
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </Select>
            </Field>
            <Field label="With error" error="This field is required">
              <Input placeholder="Required" />
            </Field>
            <Field label="Notes">
              <Textarea placeholder="Multiline…" />
            </Field>
          </div>
        </section>

        <section className={`panel ${styles.section}`} style={{ padding: 18 }}>
          <h2>DataTable (priority columns)</h2>
          <p className="muted-text" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            Narrow the window: Created/Due hide under 1024px, Amount under 768px, the Client
            column ellipsizes. No horizontal page scroll at any width.
          </p>
          <UiLabDataTable />
        </section>

        <section className={`panel ${styles.section}`} style={{ padding: 18 }}>
          <h2>DataTable (Phase 5: sort + select + inline status)</h2>
          <p className="muted-text" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
            Click headers to sort (aria-sort), tick rows for the bulk bar, click a status
            pill to change it inline.
          </p>
          <UiLabListTable />
        </section>

        <section className={`panel ${styles.section}`} style={{ padding: 18 }}>
          <h2>Badges</h2>
          <div className={styles.row}>
            <Badge>Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
          </div>
          <h3>StatusBadge mapping</h3>
          <div className={styles.row}>
            <StatusBadge label="Active" status="ACTIVE" />
            <StatusBadge label="Pending" status="PENDING" />
            <StatusBadge label="Overdue" status="OVERDUE" />
            <StatusBadge label="Failed" status="FAILED" />
            <StatusBadge label="Closed" status="CLOSED" />
          </div>
        </section>
      </div>
    </div>
  );
}
