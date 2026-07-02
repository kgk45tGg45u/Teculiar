// Single import boundary for the CONTROL-PLANE Prisma client (Phase 4.1).
//
// The control-plane client is generated to a gitignored folder outside `src`
// (prisma/control-plane/generated) so it never collides with the tenant
// `@prisma/client`. Keeping the fragile relative path in ONE file means the rest
// of the codebase imports it by a stable name. `src` and `dist` sit at the same
// depth under apps/api, so this relative path resolves identically in both.
//
// Regenerate with:  npm run db:cp:generate

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
export { PrismaClient as ControlPlanePrismaClient } from "../../../../prisma/control-plane/generated";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
export type { Tenant } from "../../../../prisma/control-plane/generated";
