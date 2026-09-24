import mongoose from 'mongoose';
import { Subscription } from './subscription.model.js';
import { getPlanLimits } from './plan.service.js';
import { checkTenantUsageLimitService } from './usage.service.js';
import { RazorpayProvider } from './providers/razorpay.provider.js';

export const inMemorySubscriptionsMap = new Map();

export const getSubscriptionService = async (sellerId) => {
  let sub = null;
  try {
    sub = await Subscription.findOne({ sellerId });
  } catch (err) {
    sub = inMemorySubscriptionsMap.get(sellerId.toString());
  }

  if (!sub) {
    const defaultSub = {
      sellerId,
      plan: 'FREE',
      status: 'ACTIVE',
      provider: 'RAZORPAY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
    try {
      sub = await Subscription.create(defaultSub);
    } catch (createErr) {
      const id = new mongoose.Types.ObjectId().toString();
      sub = { _id: id, ...defaultSub };
      inMemorySubscriptionsMap.set(sellerId.toString(), sub);
    }
  }

  const limits = getPlanLimits(sub.plan);
  const productsUsage = await checkTenantUsageLimitService(sellerId, 'products', sub.plan);
  const channelsUsage = await checkTenantUsageLimitService(sellerId, 'channels', sub.plan);

  return {
    subscription: sub,
    planLimits: limits,
    usage: {
      products: productsUsage,
      channels: channelsUsage,
    },
  };
};

export const updateSubscriptionPlanService = async (sellerId, plan) => {
  const normPlan = plan.toUpperCase().trim();
  const provider = new RazorpayProvider();
  const subRes = await provider.createSubscription(sellerId, normPlan);

  const updateData = {
    plan: normPlan,
    status: 'ACTIVE',
    externalSubscriptionId: subRes.subscriptionId,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };

  let sub = null;
  try {
    sub = await Subscription.findOneAndUpdate(
      { sellerId },
      { $set: updateData },
      { new: true, upsert: true }
    );
  } catch (err) {
    const existing = inMemorySubscriptionsMap.get(sellerId.toString()) || {};
    sub = { ...existing, sellerId, ...updateData };
    inMemorySubscriptionsMap.set(sellerId.toString(), sub);
  }

  return { subscription: sub, razorpayDetails: subRes };
};
