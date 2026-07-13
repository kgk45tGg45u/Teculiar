"use client";

import { LogOut } from "lucide-react";
import { clearAuth, type AuthScope } from "@teculiar/web-core/lib/api";
import { surfaceHref } from "@teculiar/web-core/lib/surface";
import { Button } from "@teculiar/web-core/components/ui/button";

export function LogoutButton({ redirectTo = "/", scope }: { redirectTo?: string; scope?: AuthScope }) {
  return (
    <Button
      icon={LogOut}
      onClick={() => {
        clearAuth(scope);
        window.location.assign(surfaceHref(window.location.pathname, redirectTo));
      }}
      variant="secondary"
    >
      Log out
    </Button>
  );
}
