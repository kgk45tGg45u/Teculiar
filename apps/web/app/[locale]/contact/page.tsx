import { Send } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { getLocale } from "../../../lib/i18n";
import styles from "../product-pages.module.css";

export default function ContactPage({ params }: { params: { locale: string } }) {
  const locale = getLocale(params.locale);
  const isDe = locale === "de";

  return (
    <section className={styles.hero}>
      <div className="container">
        <span className="eyebrow">{isDe ? "Kontakt" : "Contact"}</span>
        <h1>{isDe ? "Sprechen wir über Hosting, Betrieb und Abrechnung." : "Let’s talk about hosting, operations, and billing."}</h1>
        <form className="grid two">
          <input className="input" placeholder={isDe ? "Name" : "Name"} />
          <input className="input" placeholder="E-Mail" />
          <select className="input" defaultValue="managed">
            <option value="managed">{isDe ? "Managed Services" : "Managed services"}</option>
            <option value="vps">VPS</option>
            <option value="dedicated">{isDe ? "Dedicated Server" : "Dedicated servers"}</option>
          </select>
          <Button icon={Send} type="submit">
            {isDe ? "Anfrage senden" : "Send request"}
          </Button>
        </form>
      </div>
    </section>
  );
}
