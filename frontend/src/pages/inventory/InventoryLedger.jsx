import React from 'react';
import { Boxes, AlertTriangle, RefreshCw } from 'lucide-react';
import { mockProducts } from '../../utils/mockData';

export default function InventoryLedger() {
  return (
    <div className="space-y-6 font-sans text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Inventory Management & Stock Ledger</h1>
          <p className="text-slate-500">Real-time omnichannel stock allocation, reservation and transaction history.</p>
        </div>
        <button className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <RefreshCw className="w-4 h-4" /> Re-sync Stock Ledger
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Total Master Items</span>
          <span className="text-xl font-extrabold text-slate-900 mt-1 block">1,248</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">In Stock (95.8%)</span>
          <span className="text-xl font-extrabold text-emerald-600 mt-1 block">958 pcs</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Low Stock Alerts</span>
          <span className="text-xl font-extrabold text-amber-600 mt-1 block">18 items</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Channel Reservations</span>
          <span className="text-xl font-extrabold text-blue-600 mt-1 block">250 pcs</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-semibold">
            <tr>
              <th className="p-4">Product</th>
              <th className="p-4">SKU</th>
              <th className="p-4">Total Stock</th>
              <th className="p-4">Amazon</th>
              <th className="p-4">Flipkart</th>
              <th className="p-4">Myntra</th>
              <th className="p-4">POS Store</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mockProducts.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="p-4 font-bold text-slate-900">{p.name}</td>
                <td className="p-4 font-mono text-slate-600">{p.sku}</td>
                <td className="p-4 font-extrabold text-slate-900">{p.stock}</td>
                <td className="p-4 text-slate-700">{Math.round(p.stock * 0.35)}</td>
                <td className="p-4 text-slate-700">{Math.round(p.stock * 0.25)}</td>
                <td className="p-4 text-slate-700">{Math.round(p.stock * 0.20)}</td>
                <td className="p-4 text-slate-700">{Math.round(p.stock * 0.20)}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.stock < 50 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {p.stock < 50 ? 'Low Stock' : 'In Stock'}
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
