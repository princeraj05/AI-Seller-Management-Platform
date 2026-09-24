import { BaseAiProvider } from '../aiProvider.interface.js';

export class GeminiProvider extends BaseAiProvider {
  constructor(apiKey) {
    super('gemini');
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
  }

  async generateInsights(contextData) {
    return [
      {
        type: 'CHANNEL_PERFORMANCE',
        title: 'Channel Breakdown Analysis',
        description: `Active channels processed ${contextData.totalOrders || 0} orders with total value ₹${contextData.totalRevenue || 0}.`,
        confidence: 0.95,
      },
    ];
  }

  async generateRecommendations(contextData) {
    return [
      {
        type: 'PROMOTION',
        title: 'Promote Top Performing SKUs',
        reason: 'Products show high customer demand across active channels.',
        evidence: `Total orders processed: ${contextData.totalOrders || 0}`,
        suggestedAction: 'Increase visibility on marketplace listings.',
        priority: 'MEDIUM',
      },
    ];
  }

  async answerQuestion(question, contextData) {
    const qLower = question.toLowerCase();
    if (qLower.includes('channel') || qLower.includes('amazon') || qLower.includes('flipkart')) {
      return `Your sales channel breakdown shows a total of ${contextData.totalOrders || 0} master orders processed recently.`;
    }
    return `Based on real store data, total revenue stands at ₹${contextData.totalRevenue || 0}.`;
  }
}
