// Reads the configured main/base currency (currency.config.main) directly from SystemSetting,
// for repositories/services that only have a Prisma client and not the BillingService/Repository.
// Structurally typed so it needs no PrismaService import.
type SettingStore = {
  systemSetting: {
    findUnique: (args: { where: { key: string } }) => Promise<{ value: unknown } | null>;
  };
};

export async function readMainCurrency(prisma: SettingStore | undefined | null): Promise<string> {
  if (!prisma?.systemSetting?.findUnique) {
    return "EUR";
  }
  const row = await prisma.systemSetting.findUnique({ where: { key: "currency.config" } });
  const value = row?.value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const main = (value as { main?: unknown }).main;
    if (typeof main === "string" && main) {
      return main;
    }
  }
  return "EUR";
}
