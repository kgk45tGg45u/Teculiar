"use client";

import { ChevronDown, Menu } from "lucide-react";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { MenuLink } from "./menu-link";
import styles from "./site-header.module.css";

type NavLink = { href: string; label: string };

type Props = {
  cloudLabel: string;
  cloudChildren: NavLink[];
  navLinks: NavLink[];
};

export function MobileMenu({ cloudLabel, cloudChildren, navLinks }: Props) {
  const [open, setOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
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
    setCloudOpen(false);
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
          <div className={styles.mobileCloudGroup}>
            <button
              type="button"
              className={styles.mobileCloudToggle}
              aria-expanded={cloudOpen}
              onClick={() => setCloudOpen((o) => !o)}
            >
              {cloudLabel}
              <ChevronDown
                aria-hidden
                size={14}
                className={`${styles.mobileChevron}${cloudOpen ? ` ${styles.mobileChevronOpen}` : ""}`}
              />
            </button>
            {cloudOpen && (
              <div className={styles.mobileCloudChildren}>
                {cloudChildren.map((link) => (
                  <MenuLink href={link.href as Route} key={link.href} onClick={closeMenu}>
                    {link.label}
                  </MenuLink>
                ))}
              </div>
            )}
          </div>
          {navLinks.map((link) => (
            <MenuLink href={link.href as Route} key={link.href} onClick={closeMenu}>
              {link.label}
            </MenuLink>
          ))}
        </nav>
      )}
    </div>
  );
}
