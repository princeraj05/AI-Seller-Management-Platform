import { getPlanLimits } from './plan.service.js';
import { Product } from '../products/product.model.js';
import { ChannelConnection } from '../channels/channelConnection.model.js';

export const checkTenantUsageLimitService = async (sellerId, resourceType, currentPlan = 'FREE') => {
  const limits = getPlanLimits(currentPlan);

  let currentUsage = 0;
  let maxLimit = 0;

  if (resourceType === 'products') {
    maxLimit = limits.maxProducts;
    try {
      currentUsage = await Product.countDocuments({ sellerId });
    } catch (err) {
      currentUsage = 0;
    }
  } else if (resourceType === 'channels') {
    maxLimit = limits.maxChannels;
    try {
      currentUsage = await ChannelConnection.countDocuments({ sellerId, status: 'CONNECTED' });
    } catch (err) {
      currentUsage = 0;
    }
  } else {
    maxLimit = limits.maxAiGenerationsPerMonth;
  }

  const allowed = currentUsage < maxLimit;

  return {
    resourceType,
    plan: limits.name,
    currentUsage,
    maxLimit,
    allowed,
    message: allowed
      ? `Usage within plan limits (${currentUsage}/${maxLimit})`
      : `Plan limit reached for ${resourceType} (${currentUsage}/${maxLimit}). Please upgrade your plan.`,
  };
};
