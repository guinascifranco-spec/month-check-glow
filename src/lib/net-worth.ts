export type NetWorthAccount = {
  accountType: string;
  currencyCode: string;
  isActive: boolean;
  calculatedBalance: string | number | null;
};

export type NetWorthAsset = {
  currencyCode: string;
  currentValueKnown: boolean;
  currentValue: string | number | null;
};

export type NetWorthInvoice = {
  currencyCode: string;
  remainingAmount: string | number;
};

export type CurrencyNetWorth = {
  currencyCode: string;
  bankCashCents: bigint;
  investmentValueCents: bigint;
  benefitBalanceCents: bigint;
  invoiceLiabilitiesCents: bigint;
  netWorthCents: bigint;
  unknownBankAccounts: number;
  unknownInvestments: number;
  unknownBenefitWallets: number;
};

function toCents(value: string | number | null | undefined): bigint {
  if (value == null) return 0n;
  const text = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,}))?$/.exec(text);
  if (!match) throw new Error(`Invalid monetary amount: ${text}`);
  const [, sign, whole, fraction = ""] = match;
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  const rounded = fraction.length > 2 && fraction[2] >= "5" ? cents + 1n : cents;
  return sign ? -rounded : rounded;
}

export function calculateNetWorthByCurrency(input: {
  accounts: NetWorthAccount[];
  assets: NetWorthAsset[];
  invoices: NetWorthInvoice[];
}): CurrencyNetWorth[] {
  const totals = new Map<string, CurrencyNetWorth>();
  const get = (currencyCode: string) => {
    let row = totals.get(currencyCode);
    if (!row) {
      row = {
        currencyCode,
        bankCashCents: 0n,
        investmentValueCents: 0n,
        benefitBalanceCents: 0n,
        invoiceLiabilitiesCents: 0n,
        netWorthCents: 0n,
        unknownBankAccounts: 0,
        unknownInvestments: 0,
        unknownBenefitWallets: 0,
      };
      totals.set(currencyCode, row);
    }
    return row;
  };

  for (const account of input.accounts) {
    if (!account.isActive) continue;
    const row = get(account.currencyCode);
    if (account.accountType === "benefit_wallet") {
      if (account.calculatedBalance == null) row.unknownBenefitWallets += 1;
      else row.benefitBalanceCents += toCents(account.calculatedBalance);
    } else if (["bank_account", "wallet", "other"].includes(account.accountType)) {
      if (account.calculatedBalance == null) row.unknownBankAccounts += 1;
      else row.bankCashCents += toCents(account.calculatedBalance);
    }
  }

  for (const asset of input.assets) {
    const row = get(asset.currencyCode);
    if (!asset.currentValueKnown || asset.currentValue == null) row.unknownInvestments += 1;
    else row.investmentValueCents += toCents(asset.currentValue);
  }

  for (const invoice of input.invoices) {
    get(invoice.currencyCode).invoiceLiabilitiesCents += toCents(invoice.remainingAmount);
  }

  for (const row of totals.values()) {
    // VA é incluído como ativo conhecido, mas permanece exposto em componente separado.
    row.netWorthCents =
      row.bankCashCents +
      row.investmentValueCents +
      row.benefitBalanceCents -
      row.invoiceLiabilitiesCents;
  }
  return [...totals.values()].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
}

export function formatCents(cents: bigint, currencyCode: string): string {
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, "0");
  return `${sign}${new Intl.NumberFormat("pt-BR", { style: "currency", currency: currencyCode }).format(Number(whole) + Number(fraction) / 100)}`;
}
