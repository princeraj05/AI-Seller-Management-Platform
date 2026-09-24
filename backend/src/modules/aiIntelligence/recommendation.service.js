import mongoose from 'mongoose';
import { AiRecommendation } from './aiRecommendation.model.js';
import { getAnalyticsOverviewService } from '../analytics/analytics.service.js';
import { getAiProvider } from '../../ai/aiProvider.factory.js';

export const inMemoryRecommendationsMap = new Map();

export const getAiRecommendationsService = async (sellerId, query = {}) => {
  const overview = await getAnalyticsOverviewService(sellerId, query);

  const contextData = {
    totalRevenue: overview.overview.totalRevenue,
    totalOrders: overview.overview.totalOrders,
    lowStockCount: overview.overview.lowStockProducts,
    outOfStockCount: overview.overview.outOfStockProducts,
  };

  let recommendations = [];
  try {
    const provider = getAiProvider();
    recommendations = await provider.generateRecommendations(contextData);
  } catch (err) {
    console.warn('AI Provider failed for recommendations, using deterministic recommendations:', err.message);
  }

  if (!recommendations || recommendations.length === 0) {
    recommendations = [
      {
        type: 'RESTOCK',
        title: 'Inventory Restock Action',
        reason: 'Low stock items identified in inventory engine.',
        evidence: `Low-stock products: ${contextData.lowStockCount}`,
        suggestedAction: 'Review inventory ledger and create supplier purchase orders.',
        priority: contextData.lowStockCount > 0 ? 'HIGH' : 'MEDIUM',
      },
    ];
  }

  const saved = [];
  for (const rec of recommendations) {
    const payload = {
      sellerId,
      type: rec.type || 'RESTOCK',
      title: rec.title,
      reason: rec.reason,
      evidence: rec.evidence,
      suggestedAction: rec.suggestedAction,
      priority: rec.priority || 'MEDIUM',
      executed: false,
    };
    try {
      const doc = await AiRecommendation.create(payload);
      saved.push(doc);
    } catch (dbErr) {
      const id = new mongoose.Types.ObjectId().toString();
      const mockDoc = { _id: id, ...payload, createdAt: new Date() };
      inMemoryRecommendationsMap.set(id, mockDoc);
      saved.push(mockDoc);
    }
  }

  return saved;
};
