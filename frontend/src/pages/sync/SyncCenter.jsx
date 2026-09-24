import React from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

export default function SyncCenter() {
  const syncLogs = [
    { time: '20 Sep 2026, 10:24 AM', channel: 'Amazon', type: 'Products', count: 2450, status: 'Success' },
    { time: '20 Sep 2026, 10:18 AM', channel: 'Flipkart', type: 'Inventory', count: 2098, status: 'Success' },
    { time: '20 Sep 2026, 10:15 AM', channel: 'Website', type: 'Orders', count: 412, status: 'Success' },
    { time: '20 Sep 2026, 09:48 AM', channel: 'POS Store', type: 'Inventory', count: 1245, status: 'Success' },
  ];

  return (
    <div className="space-y-6 font-sans text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Sync Center & Channel Integration Health</h1>
          <p className="text-slate-500">Monitor real-time synchronization of products, stock, prices and orders across channels.</p>
        </div>
        <button className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <RefreshCw className="w-4 h-4" /> Trigger Global Re-sync
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-semibold">
            <tr>
              <th className="p-4">Timestamp</th>
              <th className="p-4">Channel</th>
              <th className="p-4">Sync Type</th>
              <th className="p-4">Records Processed</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {syncLogs.map((s, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="p-4 text-slate-600 font-mono">{s.time}</td>
                <td className="p-4 font-bold text-slate-800">{s.channel}</td>
                <td className="p-4 text-slate-700">{s.type}</td>
                <td className="p-4 font-bold text-slate-900">{s.count} items</td>
                <td className="p-4">
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
                    {s.status}
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
