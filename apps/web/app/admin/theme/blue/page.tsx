import { redirect } from "next/navigation";

// Phase 3a decoupling: the Theme page no longer has a per-theme child route. The active theme is
// chosen on the first tab of /admin/theme. This keeps the old bookmark/link working.
export default function ThemeBlueRedirect() {
  redirect("/admin/theme" as never);
}
