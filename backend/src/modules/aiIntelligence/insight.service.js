import mongoose from 'mongoose';
import { AiInsight } from './aiInsight.model.js';
import { getAnalyticsOverviewService } from '../analytics/analytics.service.js';
import { getAiProvider } from '../../ai/aiProvider.factory.js';

export const inMemoryInsightsMap = new Map();

export const getAiInsightsService = async (sellerId, query = {}) => {
  const overview = await getAnalyticsOverviewService(sellerId, query);

  const contextData = {
    totalRevenue: overview.overview.totalRevenue,
    totalOrders: overview.overview.totalOrders,
    unitsSold: overview.overview.unitsSold,
    lowStockCount: overview.overview.lowStockProducts,
    outOfStockCount: overview.overview.outOfStockProducts,
  };

  let aiInsights = [];
  try {
    const provider = getAiProvider();
    aiInsights = await provider.generateInsights(contextData);
  } catch (err) {
    console.warn('AI Provider failed for insights, using deterministic insights:', err.message);
  }

  if (!aiInsights || aiInsights.length === 0) {
    aiInsights = [
      {
        type: 'PERFORMANCE',
        title: 'Store Performance Insight',
        description: `Total revenue generated is ₹${contextData.totalRevenue} across ${contextData.totalOrders} orders.`,
        confidence: 0.9,
        evidence: `Based on ${contextData.unitsSold} total units sold`,
      },
    ];
  }

  const saved = [];
  for (const ins of aiInsights) {
    const payload = {
      sellerId,
      type: ins.type || 'GENERAL',
      title: ins.title,
      description: ins.description,
      confidence: ins.confidence || 0.9,
      evidence: ins.evidence || `Revenue: ₹${contextData.totalRevenue}`,
    };
    try {
      const doc = await AiInsight.create(payload);
      saved.push(doc);
    } catch (dbErr) {
      const id = new mongoose.Types.ObjectId().toString();
      const mockDoc = { _id: id, ...payload, createdAt: new Date() };
      inMemoryInsightsMap.set(id, mockDoc);
      saved.push(mockDoc);
    }
  }

  return saved;
};
