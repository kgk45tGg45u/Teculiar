// Reads the configured main/base currency (currency.config.main) directly from SystemSetting,
// for repositories/services that only have a Prisma client and not the BillingService/Repository.
// Structurally typed so it needs no PrismaService import.
type SettingStore = {
  systemSetting: {
    findUnique: (args: { where: { key: string } }) => Promise<{ value: unknown } | null>;
  };
};

export async function readMainCurrency(prisma: SettingStore | undefined | null): Promise<string> {
  return readSettingMain(prisma, "currency.config", "EUR");
}

// Reads the configured main/base language (i18n.languages.main) directly from SystemSetting,
// for services that only have a Prisma client. Falls back to "de" (the historical default).
export async function readMainLanguage(prisma: SettingStore | undefined | null): Promise<string> {
  return readSettingMain(prisma, "i18n.languages", "de");
}

async function readSettingMain(prisma: SettingStore | undefined | null, key: string, fallback: string): Promise<string> {
  if (!prisma?.systemSetting?.findUnique) {
    return fallback;
  }
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  const value = row?.value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const main = (value as { main?: unknown }).main;
    if (typeof main === "string" && main) {
      return main;
    }
  }
  return fallback;
}
