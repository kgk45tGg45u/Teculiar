/**
 * Category 6 — Wallet / Add Funds  AND  Category 7 — Invoice Automation.
 *
 * Combined into one serial file because both mutate the shared client's wallet
 * balance; serial execution keeps the balance deltas deterministic. Funds are
 * added via the SANDBOX method (synchronous, no real money). Automation is the
 * pure-balance path: cron's billingMaintenance auto-pays a due invoice from the
 * wallet (no external gateway needed), which is deterministic on production.
 */
import { test, expect } from "../../fixtures/test-fixtures";
import { eurosToCents } from "../../helpers/money";
import { InvoiceFactory } from "../../factories/invoice.factory";
import { attachJson } from "../../helpers/diagnostics";
import { pollUntil } from "../../helpers/polling";

test.describe.configure({ mode: "serial" });

test.describe("Category 6 — Wallet / Add Funds", () => {
  test("adding funds credits the wallet and creates a PAID deposit invoice (ledger entry)", async ({ clientApi }) => {
    const amount = eurosToCents(15);
    // A funds deposit is a PAID invoice carrying orderSnapshot.accountCreditCents.
    // (add-funds returns a TEMP "N-..." invoice whose id/number differ from the finalised
    // record, so we identify our deposit by detecting a NEW paid-deposit invoice instead.)
    const isDeposit = (i: { status: string; orderSnapshot?: { accountCreditCents?: number } }) =>
      i.status === "PAID" && i.orderSnapshot?.accountCreditCents === amount;
    const before = (await clientApi.me()).balanceCents ?? 0;
    const depositIdsBefore = new Set((await clientApi.listInvoices()).filter(isDeposit).map((i) => i.id));

    const deposit = await clientApi.addFunds(amount, "SANDBOX");
    expect(deposit.status, "sandbox funds deposit should be paid synchronously").toBe("PAID");

    // Wallet balance increased by exactly the deposit.
    expect(((await clientApi.me()).balanceCents ?? 0) - before).toBe(amount);

    // A NEW paid deposit invoice (the ledger entry) appears.
    const invoices = await pollUntil(
      () => clientApi.listInvoices(),
      (list) => list.some((i) => isDeposit(i) && !depositIdsBefore.has(i.id)),
      { description: "new paid deposit invoice listed", timeoutMs: 20_000, intervalMs: 2_000 }
    );
    expect(invoices.some((i) => isDeposit(i) && !depositIdsBefore.has(i.id))).toBe(true);
  });

  test("wallet balance is reflected by the profile endpoint after a deposit", async ({ clientApi }) => {
    const before = (await clientApi.me()).balanceCents ?? 0;
    const amount = eurosToCents(7);
    await clientApi.addFunds(amount, "SANDBOX");
    expect((await clientApi.me()).balanceCents ?? 0).toBe(before + amount);
  });

  test("multiple deposits accumulate in the wallet", async ({ clientApi }) => {
    const before = (await clientApi.me()).balanceCents ?? 0;
    await clientApi.addFunds(eurosToCents(5), "SANDBOX");
    await clientApi.addFunds(eurosToCents(8), "SANDBOX");
    expect((await clientApi.me()).balanceCents ?? 0).toBe(before + eurosToCents(13));
  });
});

test.describe("Category 7 — Invoice Automation (cron pays from wallet)", () => {
  test("cron auto-pays a due invoice from wallet balance: invoice PAID, balance reduced, transaction recorded", async ({ clientApi, adminApi }, testInfo) => {
    const me = await clientApi.me();
    const chargeCents = eurosToCents(3);

    // Fund the wallet so the balance comfortably covers the upcoming invoice.
    await clientApi.addFunds(chargeCents + eurosToCents(20), "SANDBOX");
    const balanceBefore = (await clientApi.me()).balanceCents ?? 0;
    expect(balanceBefore).toBeGreaterThanOrEqual(chargeCents);

    // Admin raises a due PENDING invoice for the client.
    const invoice = await adminApi.createInvoice(InvoiceFactory.build({ userId: me.id, amountCents: chargeCents }));
    expect(invoice.status).toBe("PENDING");
    expect(invoice.totalCents).toBe(chargeCents);

    // Trigger the cron — billingMaintenance → payInvoicesAutomatically.
    const cron = await adminApi.runCron();
    const billing = cron.ran.find((j) => j.name === "billingMaintenance");
    await attachJson(testInfo, "cron-result", cron);
    expect(billing?.status).toBe("ran");

    // The invoice is now PAID via the wallet.
    const paid = await clientApi.getInvoice(invoice.id);
    expect(paid.status, "cron should have paid the invoice from the wallet").toBe("PAID");
    const balanceTxn = (paid.transactions ?? []).find((t) => t.method === "ACCOUNT_BALANCE" && t.status === "SUCCEEDED");
    expect(balanceTxn, "an ACCOUNT_BALANCE transaction should be recorded").toBeTruthy();

    // Wallet balance dropped by at least the invoice total.
    const balanceAfter = (await clientApi.me()).balanceCents ?? 0;
    expect(balanceBefore - balanceAfter).toBeGreaterThanOrEqual(chargeCents);
  });

  test("cron reports the automatic payment attempt in billingMaintenance result", async ({ clientApi, adminApi }, testInfo) => {
    const me = await clientApi.me();
    const chargeCents = eurosToCents(2);
    await clientApi.addFunds(chargeCents + eurosToCents(10), "SANDBOX");
    const invoice = await adminApi.createInvoice(InvoiceFactory.build({ userId: me.id, amountCents: chargeCents }));

    const cron = await adminApi.runCron();
    const billing = cron.ran.find((j) => j.name === "billingMaintenance");
    const result = (billing?.result ?? {}) as { automaticPayments?: { paid?: number; failed?: number; pending?: number } };
    await attachJson(testInfo, "automatic-payments", result);

    expect(result.automaticPayments, "billingMaintenance should report automaticPayments").toBeTruthy();
    expect(typeof result.automaticPayments?.paid).toBe("number");
    expect((await clientApi.getInvoice(invoice.id)).status).toBe("PAID");
  });
});
