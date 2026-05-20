"use client";

import { LogOut } from "lucide-react";
import { clearAuth, type AuthScope } from "../../lib/api";
import { Button } from "../ui/button";

export function LogoutButton({ redirectTo = "/", scope }: { redirectTo?: string; scope?: AuthScope }) {
  return (
    <Button
      icon={LogOut}
      onClick={() => {
        clearAuth(scope);
        window.location.assign(redirectTo);
      }}
      variant="secondary"
    >
      Log out
    </Button>
  );
}
