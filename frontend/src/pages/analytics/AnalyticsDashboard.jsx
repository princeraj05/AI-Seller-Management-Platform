import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, ShoppingBag, ArrowUpRight, RefreshCw } from 'lucide-react';
import {
  getAnalyticsOverviewApi,
  getSalesAnalyticsApi,
  getRevenueAnalyticsApi,
  getProfitAnalyticsApi,
  getProductAnalyticsApi,
  getChannelAnalyticsApi,
} from '../../services/analyticsService';

export default function AnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [range, setRange] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      let res;
      if (activeTab === 'Sales') res = await getSalesAnalyticsApi({ range });
      else if (activeTab === 'Revenue') res = await getRevenueAnalyticsApi({ range });
      else if (activeTab === 'Profit') res = await getProfitAnalyticsApi({ range });
      else if (activeTab === 'Products') res = await getProductAnalyticsApi({ range });
      else if (activeTab === 'Channels') res = await getChannelAnalyticsApi({ range });
      else res = await getAnalyticsOverviewApi({ range });

      if (res && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.warn('Analytics API fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, range]);

  const overview = data?.overview || data;

  return (
    <div className="space-y-6 font-sans text-xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Business Analytics & Performance</h1>
          <p className="text-slate-500">Comprehensive sales, revenue, profit, product and channel analytics derived from store data.</p>
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
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 font-semibold text-slate-600">
        {['Overview', 'Sales', 'Revenue', 'Profit', 'Products', 'Channels'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg ${activeTab === tab ? 'bg-blue-600 text-white' : 'hover:bg-slate-100'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Profit' && overview?.status === 'INCOMPLETE_DATA' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
          <span className="font-bold block">⚠️ Profit Unavailable</span>
          <span>{overview.message}</span>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Gross Revenue</span>
          <span className="text-xl font-extrabold text-slate-900 mt-1 block">
            ₹ {overview?.grossRevenue ?? overview?.totalSales ?? 0}
          </span>
          <span className="text-emerald-600 text-[11px] font-bold">Real Store Data</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Total Orders</span>
          <span className="text-xl font-extrabold text-slate-900 mt-1 block">
            {overview?.totalOrders ?? 0}
          </span>
          <span className="text-emerald-600 text-[11px] font-bold">Master Orders</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Average Order Value</span>
          <span className="text-xl font-extrabold text-indigo-600 mt-1 block">
            ₹ {overview?.averageOrderValue ?? 0}
          </span>
          <span className="text-emerald-600 text-[11px] font-bold">Calculated AOV</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Total Units Sold</span>
          <span className="text-xl font-extrabold text-slate-900 mt-1 block">
            {overview?.unitsSold ?? 0}
          </span>
          <span className="text-emerald-600 text-[11px] font-bold">Items Delivered</span>
        </div>
      </div>
    </div>
  );
}
