"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";

type MenuLinkProps = ComponentProps<typeof Link>;

export function MenuLink({ onClick, ...props }: MenuLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }

    let element: HTMLElement | null = event.currentTarget;
    while (element) {
      if (element instanceof HTMLDetailsElement) {
        element.open = false;
      }
      element = element.parentElement;
    }
  }

  return <Link {...props} onClick={handleClick} />;
}
