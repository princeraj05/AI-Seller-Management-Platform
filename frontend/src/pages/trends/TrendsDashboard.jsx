import React, { useState } from 'react';
import { TrendingUp, Sparkles, Flame, Eye, ArrowUpRight } from 'lucide-react';

export default function TrendsDashboard() {
  const [activeTab, setActiveTab] = useState('Market Trends');

  const silhouettes = [
    { name: 'Oversized Fit', growth: '+46%', demand: 'High' },
    { name: 'Co-ord Sets', growth: '+36%', demand: 'High' },
    { name: 'Wide Leg', growth: '+32%', demand: 'Medium' },
    { name: 'Bodycon', growth: '+28%', demand: 'Medium' },
  ];

  const colors = [
    { name: 'Mocha Brown', change: '+62%' },
    { name: 'Olive Green', change: '+48%' },
    { name: 'Cherry Red', change: '+46%' },
    { name: 'Midnight Blue', change: '+38%' },
  ];

  return (
    <div className="space-y-6 font-sans text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Fashion & Market Trend Intelligence</h1>
          <p className="text-slate-500">Discover trending silhouettes, color palettes and market growth opportunities.</p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold text-slate-600">
        {['Market Trends', 'Fashion Trends', 'Product Trends', 'Color Trends', 'Opportunities'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg ${activeTab === tab ? 'bg-blue-600 text-white' : 'hover:bg-slate-100'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Content View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Flame className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-sm text-slate-900">Trending Silhouettes & Fits</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {silhouettes.map((s) => (
              <div key={s.name} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="font-bold text-slate-900 block">{s.name}</span>
                <span className="text-emerald-600 font-extrabold text-xs block">{s.growth}</span>
                <span className="text-[10px] text-slate-400">Demand: {s.demand}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Color Palette Trends */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h2 className="font-bold text-sm text-slate-900">Trending Colors</h2>
          </div>

          <div className="space-y-2">
            {colors.map((c) => (
              <div key={c.name} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                <span className="font-bold text-slate-800">{c.name}</span>
                <span className="text-emerald-600 font-extrabold">{c.change}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
