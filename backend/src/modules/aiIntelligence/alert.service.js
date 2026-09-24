import mongoose from 'mongoose';
import { AiAlert } from './aiAlert.model.js';
import { getProductAnalyticsService } from '../analytics/productAnalytics.service.js';

export const inMemoryAlertsMap = new Map();

export const getAiAlertsService = async (sellerId, query = {}) => {
  const prodAnalytics = await getProductAnalyticsService(sellerId, query);

  const newAlerts = [];

  // 1. Low Stock Alerts
  for (const p of prodAnalytics.lowStockProducts) {
    const dedupKey = `${sellerId}_LOW_STOCK_${p.sku}`;
    newAlerts.push({
      sellerId,
      type: p.stock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      severity: p.stock === 0 ? 'CRITICAL' : 'WARNING',
      title: p.stock === 0 ? `Stockout Alert: ${p.title}` : `Low Stock Alert: ${p.title}`,
      message: `Product ${p.sku} has ${p.stock} units remaining in sellable inventory.`,
      referenceId: p.sku,
      deduplicationKey: dedupKey,
      read: false,
    });
  }

  // Save alerts with deduplication check
  for (const alertData of newAlerts) {
    try {
      const existing = await AiAlert.findOne({ deduplicationKey: alertData.deduplicationKey });
      if (!existing) {
        await AiAlert.create(alertData);
      }
    } catch (err) {
      if (!inMemoryAlertsMap.has(alertData.deduplicationKey)) {
        const id = new mongoose.Types.ObjectId().toString();
        inMemoryAlertsMap.set(alertData.deduplicationKey, { _id: id, ...alertData, createdAt: new Date() });
      }
    }
  }

  let allAlerts = [];
  try {
    allAlerts = await AiAlert.find({ sellerId }).sort({ createdAt: -1 });
  } catch (err) {
    allAlerts = Array.from(inMemoryAlertsMap.values()).filter(
      (a) => a.sellerId.toString() === sellerId.toString()
    );
  }

  return allAlerts;
};
