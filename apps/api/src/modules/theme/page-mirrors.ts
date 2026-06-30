// Per-page Customizer "mirror" layout docs — a starting draft for every storefront page so the admin
// can open the Customizer and see/edit the page's content as element blocks. These are seeded as
// DRAFTS only (never auto-published), so the live site keeps rendering its built-in pages until the
// admin reviews a page and clicks Publish. The element `type` strings are interpreted by the web
// registry (apps/web/lib/customizer/registry); the API stores the docs verbatim as JSON.
//
// Content here mirrors the built-in pages closely but need not be byte-perfect — it's an editable
// head-start. Node ids are stable (keyed by page) so re-seeding is idempotent.

type LocaleText = { en: string; de: string };
type MirrorNode = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  text?: Record<string, LocaleText>;
  children?: MirrorNode[];
};
export type MirrorDoc = { schemaVersion: number; root: MirrorNode[] };

const L = (en: string, de: string): LocaleText => ({ en, de });
const doc = (root: MirrorNode[]): MirrorDoc => ({ schemaVersion: 1, root });

const hero = (id: string, text: Record<string, LocaleText>, props: Record<string, unknown> = {}): MirrorNode => ({ id, type: "hero", props: { eyebrowIcon: "ShieldCheck", ...props }, text });
const prose = (id: string, heading: LocaleText, body: LocaleText): MirrorNode => ({ id, type: "prose", text: { heading, body } });
const cta = (id: string, text: Record<string, LocaleText>, href = "/de/kontakt"): MirrorNode => ({ id, type: "cta", props: { primaryHref: href }, text });
const featureCard = (id: string, icon: string, title: LocaleText, body: LocaleText): MirrorNode => ({ id, type: "featureCard", props: { icon }, text: { title, body } });
const featureGrid = (id: string, text: Record<string, LocaleText>, cards: MirrorNode[], cols = { base: 4, md: 2, sm: 1 }): MirrorNode => ({ id, type: "featureGrid", props: { columns: cols }, text, children: cards });
const step = (id: string, num: string, title: LocaleText, body: LocaleText): MirrorNode => ({ id, type: "step", props: { num }, text: { title, body } });
const steps = (id: string, text: Record<string, LocaleText>, items: MirrorNode[]): MirrorNode => ({ id, type: "steps", props: { ctaHref: "/de/kontakt" }, text, children: items });
const productGrid = (id: string, category: string, text: Record<string, LocaleText>): MirrorNode => ({ id, type: "productGrid", props: { category, columns: { base: 3, md: 2, sm: 1 } }, text });
const domainSearch = (id: string): MirrorNode => ({ id, type: "domainSearch" });
const faqItem = (id: string, q: LocaleText, a: LocaleText): MirrorNode => ({ id, type: "faqItem", text: { question: q, answer: a } });
const faq = (id: string, text: Record<string, LocaleText>, items: MirrorNode[]): MirrorNode => ({ id, type: "faq", text, children: items });

const legal = (key: string, title: LocaleText): MirrorDoc =>
  doc([
    hero(`${key}-hero`, { eyebrow: L("Legal", "Rechtliches"), title }, { eyebrowIcon: "Scale" }),
    prose(`${key}-body`, title, L("Paste the legal text for this page here.", "Füge hier den rechtlichen Text dieser Seite ein."))
  ]);

export const PAGE_MIRRORS: Record<string, MirrorDoc> = {
  home: doc([
    hero("home-hero", {
      eyebrow: L("Fast and secure hosting from Berlin", "Schnell und sicheres Hosting aus Berlin"),
      title: L("Need some space?", "Brauchst du Freiraum?"),
      subtitle: L(
        "Web solutions for individuals, associations, organisations and small businesses. Explained personally. Priced fairly.",
        "Weblösungen für Einzelpersonen, Vereine, Organisationen und kleine Unternehmen. Persönlich erklärt. Fair berechnet."
      ),
      primaryCta: L("View hosting", "Hosting ansehen"),
      secondaryCta: L("Get free consultation", "Kostenlose Beratung"),
      stat1: L("99.9%", "99.9%"), stat1Label: L("Uptime", "Verfügbarkeit"),
      stat2: L("DE", "DE"), stat2Label: L("Servers & support", "Server & Support"),
      stat3: L("GDPR", "DSGVO"), stat3Label: L("Privacy included", "Datenschutz inklusive")
    }, { primaryHref: "/de/webhosting", secondaryHref: "/de/kontakt" }),
    featureGrid("home-explainer", {
      eyebrow: L("What you need", "Was du brauchst"),
      title: L("Everything explained – no expertise needed.", "Alles erklärt – ohne Fachwissen.")
    }, [
      featureCard("home-ex-domain", "Globe", L("Domain", "Domain"), L("Your address on the internet – e.g. yourclub.org.", "Deine Internetadresse – zum Beispiel deinverein.de.")),
      featureCard("home-ex-host", "Server", L("Web hosting", "Webhosting"), L("The space where your website is stored.", "Der Ort, an dem deine Website gespeichert wird.")),
      featureCard("home-ex-mail", "Mail", L("Email", "E-Mail"), L("Professional email addresses with your domain.", "Professionelle E-Mail-Adressen mit deiner Domain.")),
      featureCard("home-ex-cloud", "HardDrive", L("Cloud & Nextcloud", "Cloud & Nextcloud"), L("Store and share files securely – without Google or Dropbox.", "Dateien sicher speichern und teilen – ohne Google oder Dropbox.")),
      featureCard("home-ex-ssl", "ShieldCheck", L("SSL & Security", "SSL & Sicherheit"), L("The padlock in the browser bar. Essential today.", "Das Schloss in der Browserzeile. Heute Pflicht."))
    ], { base: 5, md: 2, sm: 1 }),
    domainSearch("home-domains"),
    featureGrid("home-why", {
      eyebrow: L("Why us", "Warum Dezhost"),
      title: L("Digital solutions without the corporate feel.", "Digitale Lösungen ohne Konzerngefühl.")
    }, [
      featureCard("home-why-1", "HandHeart", L("For associations & NGOs", "Für Vereine & NGOs"), L("We understand the challenges of small organisations.", "Wir kennen die Herausforderungen kleiner Organisationen.")),
      featureCard("home-why-2", "Lock", L("Privacy & independence", "Datenschutz & Unabhängigkeit"), L("All servers are located in Germany. GDPR-compliant from day one.", "Alle Server stehen in Deutschland. DSGVO-konform von Anfang an.")),
      featureCard("home-why-3", "MessageSquare", L("Personal support", "Persönlicher Support"), L("You reach real people. We explain everything clearly.", "Du erreichst echte Menschen. Wir erklären alles verständlich.")),
      featureCard("home-why-4", "Sprout", L("Fair prices", "Faire Preise"), L("We want to work sustainably and be there for you long-term.", "Wir wollen nachhaltig arbeiten und langfristig für dich da sein."))
    ]),
    steps("home-steps", {
      eyebrow: L("How it works", "So einfach geht's"),
      title: L("From idea to finished website.", "Von der Idee zur fertigen Website.")
    }, [
      step("home-step-1", "01", L("Tell us your idea", "Idee erzählen"), L("Just write to us about what you need.", "Schreib uns einfach, was du brauchst.")),
      step("home-step-2", "02", L("Choose domain & hosting", "Domain & Hosting auswählen"), L("We help you find the right fit.", "Wir helfen dir, das Richtige zu finden.")),
      step("home-step-3", "03", L("We handle setup", "Einrichtung durch uns"), L("We configure everything.", "Wir richten alles ein.")),
      step("home-step-4", "04", L("Go live", "Online gehen"), L("Your website is live. We stay reachable.", "Deine Website ist live. Wir bleiben erreichbar."))
    ]),
    cta("home-cta", {
      eyebrow: L("For associations & NGOs", "Für Vereine & NGOs"),
      title: L("You have a mission. We make sure it's visible online.", "Ihr habt eine Mission. Wir sorgen dafür, dass sie online sichtbar ist."),
      primaryCta: L("Get free consultation", "Kostenlos beraten lassen")
    })
  ]),

  webhosting: doc([
    hero("wh-hero", {
      eyebrow: L("Web hosting", "Webhosting"),
      title: L("Simple website, professional email, fair prices.", "Einfache Website, professionelle E-Mail, faire Preise."),
      primaryCta: L("View packages", "Pakete ansehen")
    }, { primaryHref: "/de/webhosting" }),
    productGrid("wh-products", "webhosting", { eyebrow: L("Hosting packages", "Hosting-Pakete"), title: L("Choose the package that fits you.", "Wähle das Paket, das zu dir passt.") }),
    faq("wh-faq", { eyebrow: L("FAQ", "FAQ"), title: L("Frequently asked questions", "Häufig gestellte Fragen") }, [
      faqItem("wh-faq-1", L("What is web hosting exactly?", "Was ist Webhosting genau?"), L("It's the space where your website lives, kept online and backed up for you.", "Es ist der Ort, an dem deine Website gespeichert wird – online gehalten und für dich gesichert.")),
      faqItem("wh-faq-2", L("Is SSL included?", "Ist SSL inklusive?"), L("Yes – SSL is included with every plan.", "Ja – SSL ist in jedem Paket enthalten."))
    ])
  ]),

  "virtual-servers": doc([
    hero("vps-hero", {
      eyebrow: L("Cloud servers", "Cloud-Server"),
      title: L("Your own cloud server.", "Dein eigener Cloud-Server."),
      subtitle: L("Basic DDoS protection is included in the price.", "Grundlegender DDoS-Schutz ist im Preis inbegriffen."),
      primaryCta: L("View packages", "Pakete ansehen")
    }, { primaryHref: "/de/virtual-servers" }),
    productGrid("vps-products", "virtual-servers", { eyebrow: L("Cloud servers", "Cloud-Server"), title: L("Choose your server.", "Wähle deinen Server.") })
  ]),

  reseller: doc([
    hero("rs-hero", {
      eyebrow: L("Reseller hosting", "Reseller-Hosting"),
      title: L("Resell hosting under your own brand.", "Hosting unter deiner eigenen Marke verkaufen."),
      primaryCta: L("View packages", "Pakete ansehen")
    }, { primaryHref: "/de/reseller" }),
    productGrid("rs-products", "reseller", { eyebrow: L("Reseller packages", "Reseller-Pakete"), title: L("Choose your reseller plan.", "Wähle deinen Reseller-Tarif.") })
  ]),

  domains: doc([
    hero("dom-hero", {
      eyebrow: L("Domains", "Domains"),
      title: L("Search, register or transfer.", "Suchen, registrieren oder transferieren."),
      subtitle: L("Fair pricing and support for hundreds of TLDs.", "Faire Preise und Unterstützung für hunderte TLDs."),
      primaryCta: L("Search domain", "Domain suchen")
    }, { primaryHref: "/de/domains/search" }),
    domainSearch("dom-search"),
    prose("dom-info", L("Connected and ready", "Verbunden und startklar"), L("We connect your domain with your hosting and set up DNS. With your domain you also get professional email addresses.", "Wir verbinden deine Domain mit deinem Hosting und richten DNS ein. Mit deiner Domain bekommst du professionelle E-Mail-Adressen."))
  ]),

  "it-losungen": doc([
    hero("it-hero", {
      eyebrow: L("IT solutions", "IT-Lösungen"),
      title: L("Set up, secure and maintain servers.", "Server einrichten, absichern und warten."),
      primaryCta: L("Get in touch", "Kontakt aufnehmen")
    }, { primaryHref: "/de/kontakt" }),
    featureGrid("it-services", { eyebrow: L("Services", "Leistungen"), title: L("Managed services for your organisation.", "Managed Services für deine Organisation.") }, [
      featureCard("it-1", "DatabaseBackup", L("Backup solutions", "Backup-Lösungen"), L("Reliable, automated backups for your data.", "Zuverlässige, automatische Backups für deine Daten.")),
      featureCard("it-2", "Wrench", L("Server maintenance", "Serverwartung"), L("Regular maintenance, updates and monitoring for your server.", "Regelmäßige Wartung, Updates und Monitoring für deinen Server.")),
      featureCard("it-3", "Mail", L("Email infrastructure", "E-Mail-Infrastruktur"), L("Professional email infrastructure for organisations.", "Professionelle E-Mail-Infrastruktur für Organisationen.")),
      featureCard("it-4", "Users", L("Contact management", "Kontaktverwaltung"), L("Contact management for clubs and small organisations.", "Kontaktverwaltung für Vereine und kleine Organisationen."))
    ])
  ]),

  webdesign: doc([
    hero("wd-hero", {
      eyebrow: L("Web design", "Webdesign"),
      title: L("Professional online – without an IT department.", "Professionell online – ohne IT-Abteilung."),
      primaryCta: L("Get a quote", "Angebot anfragen")
    }, { primaryHref: "/de/kontakt" }),
    featureGrid("wd-features", { eyebrow: L("What we build", "Was wir bauen"), title: L("Simple, professional websites.", "Einfache, professionelle Websites.") }, [
      featureCard("wd-1", "Building2", L("For your organisation", "Für eure Organisation"), L("Simple, professional website for your organisation.", "Einfache, professionelle Website für eure Organisation.")),
      featureCard("wd-2", "Palette", L("Creative websites", "Kreative Websites"), L("Creative websites for creative people.", "Kreative Websites für kreative Menschen.")),
      featureCard("wd-3", "User", L("Portfolio & blog", "Portfolio & Blog"), L("Portfolio, blog or personal website.", "Portfolio, Blog oder persönliche Website."))
    ], { base: 3, md: 2, sm: 1 }),
    cta("wd-cta", { title: L("Ready to go online?", "Bereit, online zu gehen?"), primaryCta: L("Get free consultation", "Kostenlos beraten lassen") })
  ]),

  kontakt: doc([
    hero("kt-hero", {
      eyebrow: L("Contact", "Kontakt"),
      title: L("Contact: Bijan Sabbagh", "Kontakt: Bijan Sabbagh"),
      subtitle: L("We answer real questions from real people – clearly and quickly.", "Wir beantworten echte Fragen von echten Menschen – verständlich und schnell."),
      primaryCta: L("View web hosting", "Webhosting ansehen")
    }, { primaryHref: "/de/webhosting", eyebrowIcon: "MessageCircle" }),
    prose("kt-info", L("How to reach us", "So erreichst du uns"), L("Write to us about what you need and we'll get back to you quickly. No jargon – just honest, fast help.", "Schreib uns, was du brauchst, und wir melden uns schnell zurück. Kein Fachjargon – nur ehrliche, schnelle Hilfe.")),
    cta("kt-cta", { title: L("Prefer to browse first?", "Lieber erst stöbern?"), primaryCta: L("Domains explained", "Domains erklärt") }, "/de/domains")
  ]),

  "uber-uns": doc([
    hero("ab-hero", {
      eyebrow: L("About us", "Über uns"),
      title: L("We explain everything. Really everything.", "Wir erklären alles. Wirklich alles."),
      subtitle: L(
        "Dezhost is an independent hosting provider from Germany. We help associations, NGOs, political groups and small businesses become digitally visible.",
        "Dezhost ist ein unabhängiger Hosting-Anbieter aus Deutschland. Wir unterstützen Vereine, NGOs, politische Gruppen und kleine Unternehmen dabei, digital sichtbar zu werden."
      ),
      primaryCta: L("Get in touch", "Kontakt aufnehmen")
    }, { primaryHref: "/de/kontakt", eyebrowIcon: "Globe" }),
    featureGrid("ab-values", { eyebrow: L("Our mission", "Unsere Mission"), title: L("Digital independence for everyone.", "Digitale Unabhängigkeit für alle.") }, [
      featureCard("ab-1", "HandHeart", L("For everyone, not just corporations", "Für alle, nicht nur für Konzerne"), L("Good digital infrastructure shouldn't be reserved for large companies.", "Gute digitale Infrastruktur sollte nicht nur großen Unternehmen vorbehalten sein.")),
      featureCard("ab-2", "Lock", L("Privacy is not a bonus", "Datenschutz ist kein Bonus"), L("All our servers are located in Germany. We don't share data.", "Alle unsere Server stehen in Deutschland. Wir geben keine Daten weiter.")),
      featureCard("ab-3", "Sprout", L("Sustainable, not profit-maximising", "Nachhaltig, nicht profitmaximierend"), L("We'd rather grow slowly and stay reliable.", "Wir wachsen lieber langsam und bleiben zuverlässig.")),
      featureCard("ab-4", "MessageCircle", L("Personal and explanatory", "Persönlich und erklärend"), L("We explain everything – even if you've never registered a domain.", "Wir erklären alles – auch wenn du noch nie eine Domain registriert hast."))
    ]),
    cta("ab-cta", {
      eyebrow: L("For associations & NGOs", "Für Vereine & NGOs"),
      title: L("You have a mission. We make sure it's visible online.", "Ihr habt eine Mission. Wir sorgen dafür, dass sie online sichtbar ist."),
      primaryCta: L("Get free consultation", "Kostenlos beraten lassen")
    })
  ]),

  "legal-impressum": legal("legal-impressum", L("Legal Notice", "Impressum")),
  "legal-datenschutz": legal("legal-datenschutz", L("Privacy Policy", "Datenschutz")),
  "legal-agb": legal("legal-agb", L("Terms & Conditions", "AGB")),
  "legal-zahlung": legal("legal-zahlung", L("Payment", "Zahlung")),
  "legal-widerruf": legal("legal-widerruf", L("Right of withdrawal", "Widerruf"))
};
