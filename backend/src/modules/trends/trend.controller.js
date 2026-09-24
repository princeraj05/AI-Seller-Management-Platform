import { getTrendsOverviewService } from './trend.service.js';
import { getMarketTrendsService } from './marketTrend.service.js';
import { getProductTrendsService } from './productTrend.service.js';
import { getFashionTrendsService } from './fashionTrend.service.js';
import { getColorTrendsService } from './colorTrend.service.js';
import { getOpportunitiesService } from './opportunity.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const getTrendsOverview = async (req, res) => {
  try {
    const data = await getTrendsOverviewService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Trends overview fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch trends overview');
  }
};

export const getMarketTrends = async (req, res) => {
  try {
    const data = await getMarketTrendsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Market trends fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch market trends');
  }
};

export const getProductTrends = async (req, res) => {
  try {
    const data = await getProductTrendsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Product trends fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch product trends');
  }
};

export const getFashionTrends = async (req, res) => {
  try {
    const data = await getFashionTrendsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Fashion trends fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch fashion trends');
  }
};

export const getColorTrends = async (req, res) => {
  try {
    const data = await getColorTrendsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Color trends fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch color trends');
  }
};

export const getOpportunities = async (req, res) => {
  try {
    const data = await getOpportunitiesService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Trend opportunities fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch opportunities');
  }
};
