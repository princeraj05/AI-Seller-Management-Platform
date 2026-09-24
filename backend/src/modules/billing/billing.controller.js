import { validateBillingInput } from './billing.validator.js';
import {
  getSubscriptionService,
  updateSubscriptionPlanService,
} from './billing.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const getSubscription = async (req, res) => {
  try {
    const data = await getSubscriptionService(req.tenant.sellerId);
    return successResponse(res, 200, 'Subscription details fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch subscription');
  }
};

export const updateSubscriptionPlan = async (req, res) => {
  try {
    const { isValid, errors } = validateBillingInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'Billing plan validation failed', errors);
    }

    const data = await updateSubscriptionPlanService(req.tenant.sellerId, req.body.plan);
    return successResponse(res, 200, 'Subscription plan updated successfully', data);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to update subscription plan');
  }
};
