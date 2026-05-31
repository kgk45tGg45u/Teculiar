"use client";

import { useEffect } from "react";

export function DetailsAutoClose() {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((d) => {
        if (!d.contains(e.target as Node)) {
          d.open = false;
        }
      });
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
