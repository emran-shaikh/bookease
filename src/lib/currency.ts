// Currency configuration - PKR only for Pakistan
export const CURRENCY_CONFIG = {
  code: 'PKR',
  symbol: 'Rs.',
  locale: 'en-PK',
} as const;

// Get current currency config (always PKR)
export const getCurrencyConfig = () => CURRENCY_CONFIG;

// Format price with currency
export const formatPrice = (amount: number | string): string => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return 'Rs. 0';
  }
  
  try {
    return new Intl.NumberFormat(CURRENCY_CONFIG.locale, {
      style: 'currency',
      currency: CURRENCY_CONFIG.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numAmount);
  } catch {
    return `Rs. ${numAmount.toLocaleString()}`;
  }
};

// Get just the currency symbol
export const getCurrencySymbol = (): string => {
  return CURRENCY_CONFIG.symbol;
};
