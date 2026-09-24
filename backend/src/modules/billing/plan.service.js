export const PLAN_DEFINITIONS = {
  FREE: {
    name: 'FREE',
    maxProducts: 50,
    maxChannels: 2,
    maxAiGenerationsPerMonth: 100,
    maxOrdersPerMonth: 500,
    priceMonthly: 0,
  },
  BASIC: {
    name: 'BASIC',
    maxProducts: 500,
    maxChannels: 4,
    maxAiGenerationsPerMonth: 1000,
    maxOrdersPerMonth: 5000,
    priceMonthly: 999,
  },
  PRO: {
    name: 'PRO',
    maxProducts: 5000,
    maxChannels: 10,
    maxAiGenerationsPerMonth: 10000,
    maxOrdersPerMonth: 50000,
    priceMonthly: 2999,
  },
  PREMIUM: {
    name: 'PREMIUM',
    maxProducts: 100000,
    maxChannels: 50,
    maxAiGenerationsPerMonth: 100000,
    maxOrdersPerMonth: 1000000,
    priceMonthly: 7999,
  },
};

export const getPlanLimits = (planName = 'FREE') => {
  return PLAN_DEFINITIONS[planName.toUpperCase()] || PLAN_DEFINITIONS.FREE;
};
