import React, { useState, useEffect } from 'react';
import { RotateCcw, ShieldCheck, RefreshCw } from 'lucide-react';
import { mockReturns } from '../../utils/mockData';
import { getReturnsApi } from '../../services/returnService';

export default function ReturnsList() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const res = await getReturnsApi();
      if (res && res.data && res.data.returns && res.data.returns.length > 0) {
        setReturns(res.data.returns);
      } else {
        setReturns(mockReturns);
      }
    } catch (err) {
      console.warn('Backend API fetch returns error, using mock data:', err.message);
      setReturns(mockReturns);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  return (
    <div className="space-y-6 font-sans text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">All Returns & RMA Management ({returns.length})</h1>
          <p className="text-slate-500">Manage customer returns, inspect items and initiate instant refunds across channels.</p>
        </div>
        <button
          onClick={fetchReturns}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Total Returns</span>
          <span className="text-xl font-extrabold text-slate-900 mt-1 block">{returns.length}</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Pending Approval</span>
          <span className="text-xl font-extrabold text-amber-600 mt-1 block">
            {returns.filter((r) => r.status === 'REQUESTED' || r.status === 'Pending').length}
          </span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Approved</span>
          <span className="text-xl font-extrabold text-blue-600 mt-1 block">
            {returns.filter((r) => r.status === 'APPROVED' || r.status === 'Approved').length}
          </span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Inspected / Completed</span>
          <span className="text-xl font-extrabold text-purple-600 mt-1 block">
            {returns.filter((r) => r.status === 'INSPECTED' || r.status === 'COMPLETED').length}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-semibold">
            <tr>
              <th className="p-4">RMA #</th>
              <th className="p-4">Order ID</th>
              <th className="p-4">Customer / Product</th>
              <th className="p-4">Channel</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Return Reason</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {returns.map((r, idx) => {
              const rmaNum = r.rmaNumber || r.rma || `RMA-${idx}`;
              const orderIdStr = r.externalOrderId || r.orderId?._id || r.orderId || 'N/A';
              const prodSku = r.items && r.items[0] ? `${r.items[0].sku} (x${r.items[0].quantity})` : r.product || 'N/A';
              const channelName = r.channel || 'POS';
              const refundAmt = r.refundAmount ?? r.amount ?? 0;
              const reasonStr = (r.items && r.items[0]?.reason) || r.reason || 'Customer Return';
              const statusStr = r.status || 'REQUESTED';

              return (
                <tr key={r._id || r.rma || idx} className="hover:bg-slate-50">
                  <td className="p-4 font-bold text-slate-900">{rmaNum}</td>
                  <td className="p-4 font-mono text-slate-600">{orderIdStr}</td>
                  <td className="p-4 text-slate-800">{prodSku}</td>
                  <td className="p-4 font-semibold text-slate-800">{channelName}</td>
                  <td className="p-4 font-extrabold text-slate-900">₹{refundAmt}</td>
                  <td className="p-4 text-slate-500">{reasonStr}</td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        statusStr === 'COMPLETED' || statusStr === 'INSPECTED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {statusStr}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
