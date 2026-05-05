import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { findDotEnv, loadDotEnv } from "../../src/modules/resellbiz-client/resellbiz-env";

describe("Resell.biz env loader", () => {
  it("finds the repo env file when npm runs from the workspace folder", () => {
    const root = mkdtempSync(join(tmpdir(), "resellbiz-env-"));
    const workspace = join(root, "apps", "api");
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(root, ".env"), "RESELLBIZ_RESELLER_ID=1325587\n");

    assert.equal(findDotEnv(workspace), join(root, ".env"));
  });

  it("loads values without overriding existing env", () => {
    const root = mkdtempSync(join(tmpdir(), "resellbiz-env-"));
    const file = join(root, ".env");
    const env: Record<string, string | undefined> = {
      RESELLBIZ_RESELLER_ID: "already-set"
    };
    writeFileSync(file, 'RESELLBIZ_RESELLER_ID=1325587\nRESELLBIZ_API_KEY="secret"\n');

    loadDotEnv(file, env);

    assert.equal(env.RESELLBIZ_RESELLER_ID, "already-set");
    assert.equal(env.RESELLBIZ_API_KEY, "secret");
  });
});
