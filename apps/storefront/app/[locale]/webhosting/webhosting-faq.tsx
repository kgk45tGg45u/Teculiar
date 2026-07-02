"use client";

import { useState } from "react";
import styles from "./webhosting.module.css";

type FaqItem = { q: string; a: string };

export function WebhostingFaq({ faqs }: { faqs: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className={styles.faqList}>
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i;
        return (
          <div className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`} key={faq.q}>
            <button
              className={styles.faqSummary}
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenIndex(isOpen ? null : i)}
            >
              {faq.q}
              <span className={styles.faqChevron} aria-hidden>›</span>
            </button>
            <div className={styles.faqBody} style={{ maxHeight: isOpen ? "400px" : "0" }}>
              <p>{faq.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
