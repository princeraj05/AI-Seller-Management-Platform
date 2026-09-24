import React, { useState, useEffect } from 'react';
import { Search, Filter, ShoppingBag, Eye, RefreshCw } from 'lucide-react';
import { mockOrders } from '../../utils/mockData';
import { getOrdersApi } from '../../services/orderService';

export default function OrdersList() {
  const [filterChannel, setFilterChannel] = useState('All');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await getOrdersApi();
      if (res && res.data && res.data.orders && res.data.orders.length > 0) {
        setOrders(res.data.orders);
      } else {
        setOrders(mockOrders);
      }
    } catch (err) {
      console.warn('Backend API fetch error, using mock data:', err.message);
      setOrders(mockOrders);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filtered = orders.filter((o) => {
    if (filterChannel === 'All') return true;
    const channelName = o.channel ? o.channel.toUpperCase() : '';
    const filterName = filterChannel.toUpperCase();
    return channelName.includes(filterName) || (filterName === 'OFFLINE' && channelName === 'POS');
  });

  return (
    <div className="space-y-6 font-sans text-xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Orders Management ({orders.length})</h1>
          <p className="text-xs text-slate-500">Track and fulfill online marketplace orders and offline store bills.</p>
        </div>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700"
          >
            <option value="All">All Channels</option>
            <option value="Amazon">Amazon</option>
            <option value="Flipkart">Flipkart</option>
            <option value="Myntra">Myntra</option>
            <option value="Website">Website</option>
            <option value="Offline">Offline POS</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-semibold">
            <tr>
              <th className="p-4">Order ID / External ID</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Channel</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Payment</th>
              <th className="p-4">Status</th>
              <th className="p-4">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((ord, idx) => {
              const orderId = ord.externalOrderId || ord.orderNumber || ord.id || ord._id;
              const customerName = ord.customer?.name || ord.customer || 'Customer';
              const totalAmt = ord.pricing?.totalAmount ?? ord.amount ?? 0;
              const payMethod = ord.payment?.method || ord.paymentMethod || 'PREPAID';
              const statusText = ord.orderStatus || ord.status || 'PENDING';
              const dateText = ord.createdAt ? new Date(ord.createdAt).toLocaleDateString() : ord.date || 'Today';

              return (
                <tr key={ord._id || ord.id || idx} className="hover:bg-slate-50">
                  <td className="p-4 font-bold text-slate-900">{orderId}</td>
                  <td className="p-4 text-slate-800">{customerName}</td>
                  <td className="p-4 font-semibold text-slate-700">{ord.channel}</td>
                  <td className="p-4 font-extrabold text-slate-900">₹{totalAmt}</td>
                  <td className="p-4 text-slate-500">{payMethod}</td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        statusText === 'DELIVERED' || statusText === 'COMPLETED' || statusText === 'Delivered'
                          ? 'bg-emerald-100 text-emerald-700'
                          : statusText === 'CANCELLED'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {statusText}
                    </span>
                  </td>
                  <td className="p-4 text-slate-400">{dateText}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
