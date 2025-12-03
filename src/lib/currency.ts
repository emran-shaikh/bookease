// Currency configuration based on region
export const CURRENCY_CONFIG = {
  PK: { code: 'PKR', symbol: 'Rs.', locale: 'en-PK' },
  US: { code: 'USD', symbol: '$', locale: 'en-US' },
  GB: { code: 'GBP', symbol: '£', locale: 'en-GB' },
  EU: { code: 'EUR', symbol: '€', locale: 'de-DE' },
  IN: { code: 'INR', symbol: '₹', locale: 'en-IN' },
  AE: { code: 'AED', symbol: 'AED', locale: 'ar-AE' },
} as const;

type RegionCode = keyof typeof CURRENCY_CONFIG;

// Detect region from browser/system
export const detectRegion = (): RegionCode => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const language = navigator.language || 'en-US';
    
    // Pakistan detection
    if (timezone.includes('Karachi') || language.includes('pk') || language.includes('ur')) {
      return 'PK';
    }
    // India detection
    if (timezone.includes('Kolkata') || timezone.includes('Calcutta') || language.includes('in')) {
      return 'IN';
    }
    // UAE detection
    if (timezone.includes('Dubai') || language.includes('ae')) {
      return 'AE';
    }
    // UK detection
    if (timezone.includes('London') || language === 'en-GB') {
      return 'GB';
    }
    // EU detection
    if (timezone.includes('Europe') && !timezone.includes('London')) {
      return 'EU';
    }
    
    return 'PK'; // Default to PKR for this project
  } catch {
    return 'PK';
  }
};

// Get current currency config
export const getCurrencyConfig = () => {
  const region = detectRegion();
  return CURRENCY_CONFIG[region];
};

// Format price with currency
export const formatPrice = (amount: number | string): string => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return `${getCurrencyConfig().symbol} 0`;
  }
  
  const config = getCurrencyConfig();
  
  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numAmount);
  } catch {
    return `${config.symbol} ${numAmount.toLocaleString()}`;
  }
};

// Get just the currency symbol
export const getCurrencySymbol = (): string => {
  return getCurrencyConfig().symbol;
};
