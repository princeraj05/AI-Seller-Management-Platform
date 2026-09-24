import { getAnalyticsOverviewService } from '../analytics/analytics.service.js';
import { getAiProvider } from '../../ai/aiProvider.factory.js';

export const askAiAssistantService = async (sellerId, question) => {
  const overview = await getAnalyticsOverviewService(sellerId);

  const contextData = {
    totalRevenue: overview.overview.totalRevenue,
    totalOrders: overview.overview.totalOrders,
    unitsSold: overview.overview.unitsSold,
    lowStockCount: overview.overview.lowStockProducts,
    outOfStockCount: overview.overview.outOfStockProducts,
    topProducts: overview.topProducts,
    channels: overview.channelBreakdown,
  };

  const provider = getAiProvider();
  const answer = await provider.answerQuestion(question, contextData);

  return {
    question,
    answer,
    context: {
      totalRevenue: contextData.totalRevenue,
      totalOrders: contextData.totalOrders,
    },
    timestamp: new Date(),
  };
};
