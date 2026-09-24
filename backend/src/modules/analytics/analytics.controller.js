import {
  getAnalyticsOverviewService,
} from './analytics.service.js';
import { getSalesAnalyticsService } from './salesAnalytics.service.js';
import { getRevenueAnalyticsService } from './revenueAnalytics.service.js';
import { getProfitAnalyticsService } from './profitAnalytics.service.js';
import { getProductAnalyticsService } from './productAnalytics.service.js';
import { getChannelAnalyticsService } from './channelAnalytics.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const getAnalyticsOverview = async (req, res) => {
  try {
    const data = await getAnalyticsOverviewService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Analytics overview fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch analytics overview');
  }
};

export const getSalesAnalytics = async (req, res) => {
  try {
    const data = await getSalesAnalyticsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Sales analytics fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch sales analytics');
  }
};

export const getRevenueAnalytics = async (req, res) => {
  try {
    const data = await getRevenueAnalyticsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Revenue analytics fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch revenue analytics');
  }
};

export const getProfitAnalytics = async (req, res) => {
  try {
    const data = await getProfitAnalyticsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Profit analytics fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch profit analytics');
  }
};

export const getProductAnalytics = async (req, res) => {
  try {
    const data = await getProductAnalyticsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Product analytics fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch product analytics');
  }
};

export const getChannelAnalytics = async (req, res) => {
  try {
    const data = await getChannelAnalyticsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Channel analytics fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch channel analytics');
  }
};
