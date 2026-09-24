import { BaseAiProvider } from '../aiProvider.interface.js';

export class OpenAIProvider extends BaseAiProvider {
  constructor(apiKey) {
    super('openai');
    this.apiKey = apiKey || process.env.OPENAI_API_KEY;
  }

  async generateInsights(contextData) {
    if (!this.apiKey) {
      return null;
    }
    return [
      {
        type: 'PERFORMANCE',
        title: 'Sales Growth Observed',
        description: `Revenue for top products reached ₹${contextData.totalRevenue || 0}.`,
        confidence: 0.92,
      },
    ];
  }

  async generateRecommendations(contextData) {
    if (!this.apiKey) {
      return null;
    }
    return [
      {
        type: 'RESTOCK',
        title: 'Restock High-Demand Inventory',
        reason: 'Sales velocity indicates potential stockout within 7 days.',
        evidence: `Low-stock products: ${contextData.lowStockCount || 0}`,
        suggestedAction: 'Create purchase order for low-stock items.',
        priority: 'HIGH',
      },
    ];
  }

  async answerQuestion(question, contextData) {
    const qLower = question.toLowerCase();
    if (qLower.includes('revenue') || qLower.includes('sales')) {
      return `Based on your store data, your total revenue in the selected period is ₹${contextData.totalRevenue || 0} across ${contextData.totalOrders || 0} orders.`;
    }
    if (qLower.includes('stock') || qLower.includes('inventory') || qLower.includes('restock')) {
      return `You currently have ${contextData.lowStockCount || 0} items low in stock and ${contextData.outOfStockCount || 0} out of stock.`;
    }
    return `Analysis of your store data shows total sales of ₹${contextData.totalRevenue || 0} with ${contextData.totalOrders || 0} orders processed.`;
  }
}
