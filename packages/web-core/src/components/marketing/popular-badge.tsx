import type { Locale } from "../../lib/i18n";
import { getDictionary } from "../../lib/dictionary";
import styles from "./popular-badge.module.css";

/** Card class that pairs with the badge: featured outline + absolute-position anchor. */
export const featuredCardClass = styles.featuredCard;

/**
 * The single shared "popular/beliebt" product badge (reseller card style), driven by
 * the admin-set Product.featured flag everywhere a product grid renders.
 */
export function PopularBadge({ locale }: { locale: Locale }) {
  return <span className={styles.badge}>{getDictionary(locale).storefront.popularBadge}</span>;
}
