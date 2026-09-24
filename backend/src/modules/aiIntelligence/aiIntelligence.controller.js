import { validateAssistantInput } from './aiIntelligence.validator.js';
import { getAiIntelligenceOverviewService } from './aiIntelligence.service.js';
import { getAiInsightsService } from './insight.service.js';
import { getAiRecommendationsService } from './recommendation.service.js';
import { getAiAlertsService } from './alert.service.js';
import { askAiAssistantService } from './assistant.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const getAiOverview = async (req, res) => {
  try {
    const data = await getAiIntelligenceOverviewService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'AI intelligence overview fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch AI intelligence overview');
  }
};

export const getAiInsights = async (req, res) => {
  try {
    const data = await getAiInsightsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'AI insights fetched successfully', { insights: data });
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch AI insights');
  }
};

export const getAiRecommendations = async (req, res) => {
  try {
    const data = await getAiRecommendationsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'AI recommendations fetched successfully', { recommendations: data });
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch AI recommendations');
  }
};

export const getAiAlerts = async (req, res) => {
  try {
    const data = await getAiAlertsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'AI alerts fetched successfully', { alerts: data });
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch AI alerts');
  }
};

export const askAiAssistant = async (req, res) => {
  try {
    const { isValid, errors } = validateAssistantInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'AI Assistant input validation failed', errors);
    }

    const data = await askAiAssistantService(req.tenant.sellerId, req.body.question);
    return successResponse(res, 200, 'AI assistant answer generated', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'AI Assistant failed to process request');
  }
};
