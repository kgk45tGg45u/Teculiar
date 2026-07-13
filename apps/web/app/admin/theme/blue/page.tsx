import { redirect } from "next/navigation";
import { surfaceHrefMapper } from "@teculiar/web-core/lib/server-api";

// Phase 3a decoupling: the Theme page no longer has a per-theme child route. The active theme is
// chosen on the first tab of /admin/theme. This keeps the old bookmark/link working.
export default async function ThemeBlueRedirect() {
  const href = await surfaceHrefMapper();
  redirect(href("/admin/theme") as never);
}
