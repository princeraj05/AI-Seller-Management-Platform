import React from 'react';
import { Tag, Sparkles, RefreshCw } from 'lucide-react';
import { mockProducts } from '../../utils/mockData';

export default function PriceManagement() {
  return (
    <div className="space-y-6 font-sans text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Price Management & AI Pricing</h1>
          <p className="text-slate-500">Manage master pricing and view AI optimal price recommendations across channels.</p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <Sparkles className="w-4 h-4 text-amber-300" /> Apply AI Pricing Rules
        </button>
      </div>

      {/* AI Pricing Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-4 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="font-bold text-slate-900">Let AI find the perfect price</h3>
            <p className="text-[11px] text-slate-600">Increase sales, stay competitive and maximize profit with smart dynamic pricing.</p>
          </div>
        </div>
        <button className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg text-xs">
          View Recommendations
        </button>
      </div>

      {/* Pricing Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-semibold">
            <tr>
              <th className="p-4">Product</th>
              <th className="p-4">SKU</th>
              <th className="p-4">Cost Price</th>
              <th className="p-4">Master Price</th>
              <th className="p-4">Amazon Price</th>
              <th className="p-4">Flipkart Price</th>
              <th className="p-4">Myntra Price</th>
              <th className="p-4">POS Price</th>
              <th className="p-4">Sync Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mockProducts.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="p-4 font-bold text-slate-900">{p.name}</td>
                <td className="p-4 font-mono text-slate-600">{p.sku}</td>
                <td className="p-4 text-slate-600">₹{p.costPrice}</td>
                <td className="p-4 font-extrabold text-slate-900">₹{p.masterPrice}</td>
                <td className="p-4 font-semibold text-amber-700">₹{p.channelPrices.amazon}</td>
                <td className="p-4 font-semibold text-blue-700">₹{p.channelPrices.flipkart}</td>
                <td className="p-4 font-semibold text-pink-700">₹{p.channelPrices.myntra}</td>
                <td className="p-4 font-semibold text-emerald-700">₹{p.channelPrices.pos}</td>
                <td className="p-4">
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
                    Synced
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
