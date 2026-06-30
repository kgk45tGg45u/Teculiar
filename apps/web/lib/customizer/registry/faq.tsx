// FAQ / accordion (theme-neutral). A section header over a list of native <details> items, so it
// renders identically on the live server page and in the client preview without any extra JS.
import { newId } from "../id";
import { textOf } from "../resolve";
import styles from "./faq.module.css";
import type { ElementDef } from "./types";

export const faqDef: ElementDef = {
  type: "faq",
  category: "section",
  label: { en: "FAQ", de: "FAQ" },
  icon: "MessageCircleQuestion",
  isContainer: true,
  accepts: ["faqItem"],
  textSlots: [
    { key: "eyebrow" },
    { key: "title", multiline: true }
  ],
  propSchema: [],
  example: () => ({
    id: newId(),
    type: "faq",
    text: {
      eyebrow: { en: "FAQ", de: "FAQ" },
      title: { en: "Frequently asked questions", de: "Häufig gestellte Fragen" }
    },
    children: [faqItemDef.example(), faqItemDef.example()]
  }),
  Render: ({ node, locale, mainLocale, children }) => {
    const eyebrow = textOf(node, "eyebrow", locale, mainLocale);
    const title = textOf(node, "title", locale, mainLocale);
    return (
      <section className="section">
        <div className="container">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          {title ? <h2>{title}</h2> : null}
          <div className={styles.list}>{children}</div>
        </div>
      </section>
    );
  }
};

export const faqItemDef: ElementDef = {
  type: "faqItem",
  category: "card",
  label: { en: "FAQ item", de: "FAQ-Eintrag" },
  icon: "HelpCircle",
  isContainer: false,
  textSlots: [
    { key: "question" },
    { key: "answer", multiline: true }
  ],
  propSchema: [],
  example: () => ({
    id: newId(),
    type: "faqItem",
    text: {
      question: { en: "Where are your servers located?", de: "Wo stehen eure Server?" },
      answer: {
        en: "All our servers are located in Germany and are GDPR-compliant from day one.",
        de: "Alle unsere Server stehen in Deutschland und sind von Anfang an DSGVO-konform."
      }
    }
  }),
  Render: ({ node, locale, mainLocale }) => {
    const question = textOf(node, "question", locale, mainLocale);
    const answer = textOf(node, "answer", locale, mainLocale);
    return (
      <details className={styles.item}>
        <summary className={styles.summary}>
          {question}
          <span aria-hidden className={styles.chevron}>›</span>
        </summary>
        <div className={styles.body}>
          <p>{answer}</p>
        </div>
      </details>
    );
  }
};
