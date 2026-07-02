import type { Locale } from "./i18n";

export type ProductCard = {
  name: string;
  type: "Shared" | "Domain" | "VPS" | "Dedicated" | "Nextcloud" | "CRM" | "Managed" | "Support";
  price: string;
  setup: string;
  summary: string;
  highlights: string[];
};

const catalog: Record<Locale, ProductCard[]> = {
  de: [
    {
      name: "Shared Hosting S",
      type: "Shared",
      price: "ab 6,90 EUR / Monat",
      setup: "0 EUR Setup",
      summary: "SSD-Webspace, Mail, Backups und PHP-Stacks für kleine Websites.",
      highlights: ["10 GB NVMe", "Tägliche Backups", "Managed Updates"]
    },
    {
      name: "Cloud VPS Start",
      type: "VPS",
      price: "ab 9,90 EUR / Monat",
      setup: "5 EUR Setup",
      summary: "Skalierbare virtuelle Server mit deutschen Standorten und Snapshot-Optionen.",
      highlights: ["2 vCPU", "4 GB RAM", "Restart im Portal"]
    },
    {
      name: "Dedicated DE Pro",
      type: "Dedicated",
      price: "ab 89 EUR / Monat",
      setup: "49 EUR Setup",
      summary: "Bare-Metal-Server in Deutschland für rechenintensive Workloads.",
      highlights: ["ECC RAM", "RAID Optionen", "24/7 Monitoring"]
    },
    {
      name: "Nextcloud Team",
      type: "Nextcloud",
      price: "ab 14,90 EUR / Monat",
      setup: "19 EUR Setup",
      summary: "Sichere Dateizusammenarbeit mit Speicher, Nutzerpaketen und Wartung.",
      highlights: ["DSGVO Standort", "Office Integration", "Branding Add-on"]
    }
  ],
  en: [
    {
      name: "Shared Hosting S",
      type: "Shared",
      price: "from EUR 6.90 / month",
      setup: "EUR 0 setup",
      summary: "SSD webspace, mail, backups, and PHP stacks for small websites.",
      highlights: ["10 GB NVMe", "Daily backups", "Managed updates"]
    },
    {
      name: "Cloud VPS Start",
      type: "VPS",
      price: "from EUR 9.90 / month",
      setup: "EUR 5 setup",
      summary: "Scalable virtual servers in Germany with snapshot options.",
      highlights: ["2 vCPU", "4 GB RAM", "Portal restart"]
    },
    {
      name: "Dedicated DE Pro",
      type: "Dedicated",
      price: "from EUR 89 / month",
      setup: "EUR 49 setup",
      summary: "Bare-metal servers in Germany for compute-heavy workloads.",
      highlights: ["ECC RAM", "RAID options", "24/7 monitoring"]
    },
    {
      name: "Nextcloud Team",
      type: "Nextcloud",
      price: "from EUR 14.90 / month",
      setup: "EUR 19 setup",
      summary: "Secure file collaboration with storage, user packs, and maintenance.",
      highlights: ["GDPR location", "Office integration", "Branding add-on"]
    }
  ]
};

export function getCatalog(locale: Locale) {
  return catalog[locale];
}
