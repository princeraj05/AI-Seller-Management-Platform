import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  ShoppingBag,
  Package,
  AlertTriangle,
  RotateCcw,
  DollarSign,
  Sparkles,
  Plus,
  RefreshCw,
  Tag,
  BarChart2,
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react';
import { mockOrders } from '../../utils/mockData';
import { getAnalyticsOverviewApi } from '../../services/analyticsService';
import { getAiInsightsApi } from '../../services/aiIntelligenceService';

export default function Dashboard() {
  const [range, setRange] = useState('30d');
  const [overview, setOverview] = useState(null);
  const [aiInsights, setAiInsights] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const overviewRes = await getAnalyticsOverviewApi({ range });
      if (overviewRes && overviewRes.data) {
        setOverview(overviewRes.data.overview);
      }
      const aiRes = await getAiInsightsApi({ range });
      if (aiRes && aiRes.data && aiRes.data.insights) {
        setAiInsights(aiRes.data.insights);
      }
    } catch (err) {
      console.warn('API fetch dashboard error, displaying default metrics:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [range]);

  const salesVal = overview ? `₹ ${overview.totalSales}` : '₹ 0';
  const ordersVal = overview ? overview.totalOrders : 0;
  const productsVal = overview ? overview.activeProducts : 0;
  const lowStockVal = overview ? overview.lowStockProducts : 0;
  const returnsVal = overview ? overview.cancelledOrders : 0;
  const profitVal = overview && overview.profitStatus === 'COMPLETE' ? `₹ ${overview.totalProfit}` : 'Cost Missing';

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner Greeting */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Good Afternoon, Seller! 👋
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            "Smarter selling. Bigger growth. Powered by AI." Here's what's happening with your business today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-lg shadow-sm"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <Link
            to="/products/new"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </Link>
        </div>
      </div>

      {/* 6 Key Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Sales</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-slate-900">{salesVal}</div>
          <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-0.5">
            <TrendingUp className="w-3 h-3" /> Real API Data
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Orders</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-slate-900">{ordersVal}</div>
          <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-0.5">
            <TrendingUp className="w-3 h-3" /> Real API Data
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Products</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-slate-900">{productsVal}</div>
          <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-0.5">
            <TrendingUp className="w-3 h-3" /> Active Catalog
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Low Stock</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-slate-900">{lowStockVal}</div>
          <div className="text-[11px] text-rose-600 font-semibold flex items-center gap-0.5">
            Inventory Risk
          </div>
        </div>

        {/* Metric 5 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Cancellations</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-slate-900">{returnsVal}</div>
          <div className="text-[11px] text-slate-500 font-semibold flex items-center gap-0.5">
            Cancelled Orders
          </div>
        </div>

        {/* Metric 6 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Net Profit</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-extrabold text-slate-900">{profitVal}</div>
          <div className="text-[11px] text-slate-500 font-semibold flex items-center gap-0.5">
            Cost Basis Check
          </div>
        </div>
      </div>

      {/* Middle Grid Row: Sales Overview & AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Overview Chart Box */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-slate-900">Sales Overview</h2>
              <p className="text-xs text-slate-500">Multi-channel revenue breakdown ({range})</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-lg font-extrabold text-slate-900">{salesVal}</span>
              </div>
            </div>
          </div>

          {/* SVG Sales Graph */}
          <div className="h-64 w-full pt-4 relative">
            <svg viewBox="0 0 500 200" className="w-full h-full overflow-visible">
              <line x1="0" y1="40" x2="500" y2="40" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="0" y1="90" x2="500" y2="90" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="0" y1="140" x2="500" y2="140" stroke="#f1f5f9" strokeWidth="1" />

              <path
                d="M 0,140 Q 80,90 160,110 T 320,60 T 500,70"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="3"
              />
            </svg>
          </div>
        </div>

        {/* AI Insights Sidebar Box */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-sm text-slate-900">AI Business Insights</h2>
            </div>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Live AI</span>
          </div>

          <div className="space-y-3">
            {aiInsights.length > 0 ? (
              aiInsights.map((ins, idx) => (
                <div key={idx} className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    ✨ {ins.title}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                    {ins.description}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400">No active AI insights for current selection.</p>
            )}
          </div>

          <Link
            to="/ai-studio"
            className="block w-full text-center text-xs text-blue-600 font-semibold hover:underline border-t border-slate-100 pt-3"
          >
            View All AI Insights →
          </Link>
        </div>
      </div>
    </div>
  );
}
