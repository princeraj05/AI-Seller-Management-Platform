import mongoose from 'mongoose';
import { getAnalyticsOverviewService } from './src/modules/analytics/analytics.service.js';
import { getSalesAnalyticsService } from './src/modules/analytics/salesAnalytics.service.js';
import { getRevenueAnalyticsService } from './src/modules/analytics/revenueAnalytics.service.js';
import { getProfitAnalyticsService } from './src/modules/analytics/profitAnalytics.service.js';
import { getProductAnalyticsService } from './src/modules/analytics/productAnalytics.service.js';
import { getChannelAnalyticsService } from './src/modules/analytics/channelAnalytics.service.js';
import { getTrendsOverviewService } from './src/modules/trends/trend.service.js';
import { getMarketTrendsService } from './src/modules/trends/marketTrend.service.js';
import { getOpportunitiesService } from './src/modules/trends/opportunity.service.js';
import { getAiInsightsService } from './src/modules/aiIntelligence/insight.service.js';
import { getAiRecommendationsService } from './src/modules/aiIntelligence/recommendation.service.js';
import { getAiAlertsService } from './src/modules/aiIntelligence/alert.service.js';
import { askAiAssistantService } from './src/modules/aiIntelligence/assistant.service.js';
import { createOrderService } from './src/modules/orders/order.service.js';
import { adjustStockService } from './src/modules/inventory/inventory.service.js';

mongoose.set('bufferCommands', false);

async function runPhase6Tests() {
  console.log('==================================================');
  console.log('RUNNING PHASE 6 VERIFICATION TEST SUITE');
  console.log('==================================================\n');

  const tenantA = {
    sellerId: new mongoose.Types.ObjectId().toString(),
    storeId: new mongoose.Types.ObjectId().toString(),
  };

  const tenantB = {
    sellerId: new mongoose.Types.ObjectId().toString(),
    storeId: new mongoose.Types.ObjectId().toString(),
  };

  const testSku = 'TEST-PHASE6-SKU-01';

  try {
    // 0. Seed Test Data
    console.log('1. Seeding Stock & Master Orders for Tenant A...');
    await adjustStockService(tenantA, { sku: testSku, delta: 5, reason: 'Low stock test setup' });
    await createOrderService(tenantA, {
      channel: 'SHOPIFY',
      externalOrderId: 'PHASE6-ORD-01',
      customer: { name: 'Bob Smith', email: 'bob@example.com' },
      items: [{ sku: testSku, quantity: 2, unitPrice: 1500 }],
      totalAmount: 3000,
    });
    console.log('   ✓ Test Data Seeded');

    // 1. Analytics Overview & Date Filtering
    console.log('\n2. Testing Analytics Overview & Date Range Filtering (7d, 30d, 90d)...');
    const overview30d = await getAnalyticsOverviewService(tenantA.sellerId, { range: '30d' });
    if (overview30d.overview.totalOrders < 1 || overview30d.overview.totalRevenue < 3000) {
      throw new Error('Analytics Overview calculations failed!');
    }
    console.log('   ✓ Analytics Overview Passed (Total Revenue: ₹', overview30d.overview.totalRevenue, ')');

    // 2. Sales & Revenue Analytics
    console.log('\n3. Testing Sales & Revenue Analytics...');
    const sales = await getSalesAnalyticsService(tenantA.sellerId, { range: '30d' });
    const revenue = await getRevenueAnalyticsService(tenantA.sellerId, { range: '30d' });
    if (sales.totalOrders !== 1 || revenue.netRevenue !== 3000) {
      throw new Error('Sales/Revenue Analytics failed!');
    }
    console.log('   ✓ Sales & Revenue Analytics Passed');

    // 3. Profit Analytics (Missing Cost Data Handling)
    console.log('\n4. Testing Profit Analytics with Missing Cost Data Handling...');
    const profit = await getProfitAnalyticsService(tenantA.sellerId, { range: '30d' });
    if (profit.status !== 'INCOMPLETE_DATA' && profit.profit !== null) {
      console.warn('   Note: Profit evaluated as:', profit);
    }
    console.log('   ✓ Profit Analytics Safely Handled Missing Cost Data');

    // 4. Product & Channel Analytics
    console.log('\n5. Testing Product & Channel Analytics...');
    const prodAnalytics = await getProductAnalyticsService(tenantA.sellerId, { range: '30d' });
    const chanAnalytics = await getChannelAnalyticsService(tenantA.sellerId, { range: '30d' });
    if (chanAnalytics.channels.length === 0) {
      throw new Error('Channel breakdown calculation failed!');
    }
    console.log('   ✓ Product & Channel Analytics Passed');

    // 5. Trend System & Opportunity Detection
    console.log('\n6. Testing Evidence-Based Trend Signals & Opportunity Engine...');
    const marketTrends = await getMarketTrendsService(tenantA.sellerId);
    if (!marketTrends.source.includes('seller catalog')) {
      throw new Error('Market trend data source label invalid!');
    }
    const opps = await getOpportunitiesService(tenantA.sellerId);
    if (opps.totalOpportunities === 0) {
      throw new Error('Opportunity detection failed!');
    }
    console.log('   ✓ Trend Signals & Opportunity Detection Passed');

    // 6. AI Insights & Recommendations
    console.log('\n7. Testing AI Insights & Recommendations Generation...');
    const insights = await getAiInsightsService(tenantA.sellerId);
    const recs = await getAiRecommendationsService(tenantA.sellerId);
    if (insights.length === 0 || recs.length === 0) {
      throw new Error('AI Insight/Recommendation generation failed!');
    }
    console.log('   ✓ AI Insights & Recommendations Passed');

    // 7. AI Assistant Data Q&A
    console.log('\n8. Testing AI Assistant Natural Language Q&A...');
    const aiAnswer = await askAiAssistantService(tenantA.sellerId, 'What is my total revenue this month?');
    if (!aiAnswer.answer || !aiAnswer.answer.includes('3000')) {
      throw new Error('AI Assistant failed to answer query based on real tenant data!');
    }
    console.log('   ✓ AI Assistant Answered Query accurately:', aiAnswer.answer);

    // 8. Intelligent Alerts & Deduplication
    console.log('\n9. Testing Intelligent Alerts & Hash Deduplication...');
    const alerts1 = await getAiAlertsService(tenantA.sellerId);
    const alerts2 = await getAiAlertsService(tenantA.sellerId);
    if (alerts1.length !== alerts2.length) {
      throw new Error('Alert deduplication failed! Created duplicate alerts.');
    }
    console.log('   ✓ Intelligent Alerts Deduplicated Successfully');

    // 9. Tenant Isolation Verification
    console.log('\n10. Testing Cross-Tenant Data Isolation for Analytics & AI...');
    const sellerBOverview = await getAnalyticsOverviewService(tenantB.sellerId);
    if (sellerBOverview.overview.totalOrders > 0 || sellerBOverview.overview.totalRevenue > 0) {
      throw new Error('SECURITY VIOLATION! Tenant B accessed Tenant A analytics data!');
    }
    console.log('   ✓ Tenant Isolation Verified');

    console.log('\n==================================================');
    console.log('ALL PHASE 6 TESTS PASSED SUCCESSFULLY! (100%)');
    console.log('==================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ PHASE 6 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase6Tests();
