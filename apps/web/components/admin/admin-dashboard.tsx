import { ChartNoAxesCombined, FileText, Settings, ShieldCheck, Ticket, UsersRound } from "lucide-react";
import { Button } from "../ui/button";
import { StatusPill } from "../ui/status-pill";
import styles from "./admin-dashboard.module.css";

const modules = [
  { title: "Accounts", body: "Clients, partners, contacts, segments, email logs.", icon: UsersRound },
  { title: "Billing", body: "Invoices, filters, transactions, coupons, processors.", icon: FileText },
  { title: "Support", body: "Departments, routing, paid tickets, canned replies.", icon: Ticket },
  { title: "Products", body: "Hosting packages, domain packages, add-ons, configs.", icon: Settings },
  { title: "Reports", body: "Revenue, churn, product mix, customer analytics.", icon: ChartNoAxesCombined },
  { title: "Security", body: "Staff, roles, permissions, audit trail, 2FA policy.", icon: ShieldCheck }
];

export function AdminDashboard() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className="eyebrow">Admin</span>
          <h1>Operations Console</h1>
          <p>Unified control plane for clients, billing, support, products, reports, and settings.</p>
        </div>
        <Button href="/de" variant="secondary">
          Website
        </Button>
      </header>

      <section className="grid four">
        <div className="metric">
          <strong>EUR 42.8k</strong>
          <span>MRR</span>
        </div>
        <div className="metric">
          <strong>381</strong>
          <span>Active services</span>
        </div>
        <div className="metric">
          <strong>27</strong>
          <span>Open tickets</span>
        </div>
        <div className="metric">
          <strong>8</strong>
          <span>Failed payments</span>
        </div>
      </section>

      <section className="grid three">
        {modules.map((module) => (
          <article className={styles.module} key={module.title}>
            <module.icon aria-hidden size={24} />
            <h2>{module.title}</h2>
            <p>{module.body}</p>
          </article>
        ))}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <span className="eyebrow">Billing</span>
            <h2>Invoice Queue</h2>
          </div>
          <StatusPill label="Live filters" tone="good" />
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client</th>
              <th>Status</th>
              <th>Total</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>INV-2026-0042</td>
              <td>Nordstern GmbH</td>
              <td>
                <StatusPill label="Unpaid" tone="warn" />
              </td>
              <td>EUR 354.62</td>
              <td>2026-05-12</td>
            </tr>
            <tr>
              <td>INV-2026-0041</td>
              <td>Studio Rot</td>
              <td>
                <StatusPill label="Paid" tone="good" />
              </td>
              <td>EUR 89.00</td>
              <td>2026-05-03</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
