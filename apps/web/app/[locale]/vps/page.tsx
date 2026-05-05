import { RotateCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { getLocale } from "../../../lib/i18n";
import styles from "../product-pages.module.css";

export default async function VpsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = getLocale(rawLocale);
  const isDe = locale === "de";

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">Cloud VPS</span>
          <h1>{isDe ? "Virtuelle Server mit Portal-Aktionen und Lifecycle-Status." : "Virtual servers with portal actions and lifecycle status."}</h1>
          <p>
            {isDe
              ? "Starten, upgraden, kündigen oder neu starten. Provisionierung bleibt über Provider-Adapter austauschbar."
              : "Start, upgrade, cancel, or restart. Provisioning remains replaceable through provider adapters."}
          </p>
          <Button href="/client" icon={RotateCw}>
            {isDe ? "Portal öffnen" : "Open portal"}
          </Button>
        </div>
      </section>
      <section className="section tight">
        <div className={`container ${styles.pricingGrid}`}>
          {["Start", "Business", "Scale"].map((plan, index) => (
            <div className={styles.price} key={plan}>
              <h2>{plan}</h2>
              <strong>{index === 0 ? "9,90 EUR" : index === 1 ? "24,90 EUR" : "59,90 EUR"}</strong>
              <p>{isDe ? "Monatlich, quartalsweise oder jährlich abrechenbar." : "Billable monthly, quarterly, or yearly."}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
