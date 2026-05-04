"use client";

import { CreditCard, FileText, LifeBuoy, RotateCw, Server, XCircle } from "lucide-react";
import { usePortalStore, type ServiceStatus } from "../../store/use-portal-store";
import { Button } from "../ui/button";
import { StatusPill } from "../ui/status-pill";
import styles from "./client-dashboard.module.css";

const statusTone: Record<ServiceStatus, "good" | "warn" | "neutral"> = {
  active: "good",
  provisioning: "warn",
  suspended: "warn",
  cancelled: "neutral"
};

export function ClientDashboard() {
  const { services, restartService, cancelService } = usePortalStore();

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <strong>CrimsonGrid</strong>
        <nav aria-label="Client">
          <a href="#services">Services</a>
          <a href="#domains">Domains</a>
          <a href="#billing">Billing</a>
          <a href="#support">Support</a>
          <a href="#profile">Profile</a>
        </nav>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className="eyebrow">Client Portal</span>
            <h1>Dashboard</h1>
          </div>
          <Button href="/de/pricing" icon={CreditCard}>
            Neuer Service
          </Button>
        </header>

        <section className="grid four" aria-label="Overview">
          <div className="metric">
            <Server aria-hidden size={22} />
            <strong>{services.filter((service) => service.status === "active").length}</strong>
            <span>Aktive Services</span>
          </div>
          <div className="metric">
            <FileText aria-hidden size={22} />
            <strong>2</strong>
            <span>Offene Rechnungen</span>
          </div>
          <div className="metric">
            <LifeBuoy aria-hidden size={22} />
            <strong>1</strong>
            <span>Aktives Ticket</span>
          </div>
          <div className="metric">
            <CreditCard aria-hidden size={22} />
            <strong>SEPA</strong>
            <span>Standardzahlung</span>
          </div>
        </section>

        <section className={styles.block} id="services">
          <div className={styles.blockHeader}>
            <div>
              <span className="eyebrow">Services</span>
              <h2>Verträge und Status</h2>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Typ</th>
                  <th>Status</th>
                  <th>Verlängerung</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td>{service.name}</td>
                    <td>{service.kind}</td>
                    <td>
                      <StatusPill label={service.status} tone={statusTone[service.status]} />
                    </td>
                    <td>{service.renewsAt}</td>
                    <td>
                      <div className={styles.actions}>
                        <button title="Restart" type="button" onClick={() => restartService(service.id)}>
                          <RotateCw aria-hidden size={16} />
                        </button>
                        <button title="Cancel" type="button" onClick={() => cancelService(service.id)}>
                          <XCircle aria-hidden size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid three">
          <div className={styles.module} id="billing">
            <h2>Billing</h2>
            <p>Unpaid invoice INV-2026-0042, due 2026-05-12.</p>
            <Button href="/client#billing" icon={CreditCard} variant="secondary">
              Rechnung bezahlen
            </Button>
          </div>
          <div className={styles.module} id="support">
            <h2>Support</h2>
            <p>Paid ticket balance: 3 priority replies.</p>
            <Button href="/client#support" icon={LifeBuoy} variant="secondary">
              Ticket öffnen
            </Button>
          </div>
          <div className={styles.module} id="profile">
            <h2>Profile</h2>
            <p>2FA active, payment method verified, GDPR export available.</p>
            <Button href="/client#profile" icon={FileText} variant="secondary">
              Daten exportieren
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
