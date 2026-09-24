import { getAiInsightsService } from './insight.service.js';
import { getAiRecommendationsService } from './recommendation.service.js';
import { getAiAlertsService } from './alert.service.js';
import { askAiAssistantService } from './assistant.service.js';

export const getAiIntelligenceOverviewService = async (sellerId, query = {}) => {
  const insights = await getAiInsightsService(sellerId, query);
  const recommendations = await getAiRecommendationsService(sellerId, query);
  const alerts = await getAiAlertsService(sellerId, query);

  return {
    insights,
    recommendations,
    alerts,
  };
};
