"use client";

import { ChevronDown, Menu } from "lucide-react";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import type { NavNode } from "../../lib/storefront-theme";
import { MenuLink } from "./menu-link";
import styles from "./site-header.module.css";

export function MobileMenu({ nav }: { nav: NavNode[] }) {
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleOutside);
    return () => document.removeEventListener("click", handleOutside);
  }, [open]);

  function closeMenu() {
    setOpen(false);
    setOpenGroups({});
  }

  return (
    <div ref={ref} className={styles.mobileMenu}>
      <button
        type="button"
        className={styles.mobileMenuBtn}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
      >
        <Menu aria-hidden size={18} />
        <span>Menu</span>
      </button>

      {open && (
        <nav className={styles.mobileNav} aria-label="Mobile primary">
          {nav.map((node) => (node.children.length ? (
            <div className={styles.mobileCloudGroup} key={node.label}>
              <button
                type="button"
                className={styles.mobileCloudToggle}
                aria-expanded={!!openGroups[node.label]}
                onClick={() => setOpenGroups((g) => ({ ...g, [node.label]: !g[node.label] }))}
              >
                {node.label}
                <ChevronDown
                  aria-hidden
                  size={14}
                  className={`${styles.mobileChevron}${openGroups[node.label] ? ` ${styles.mobileChevronOpen}` : ""}`}
                />
              </button>
              {openGroups[node.label] && (
                <div className={styles.mobileCloudChildren}>
                  {node.children.map((child) => (
                    <MenuLink href={(child.href ?? "#") as Route} key={child.href ?? child.label} onClick={closeMenu} target={child.newTab ? "_blank" : undefined}>
                      {child.label}
                    </MenuLink>
                  ))}
                </div>
              )}
            </div>
          ) : node.href ? (
            <MenuLink href={node.href as Route} key={node.href} onClick={closeMenu} target={node.newTab ? "_blank" : undefined}>
              {node.label}
            </MenuLink>
          ) : null))}
        </nav>
      )}
    </div>
  );
}
