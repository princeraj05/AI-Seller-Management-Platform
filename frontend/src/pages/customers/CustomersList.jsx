import React from 'react';
import { Users, Mail, Phone, MapPin } from 'lucide-react';
import { mockCustomers } from '../../utils/mockData';

export default function CustomersList() {
  return (
    <div className="space-y-6 font-sans text-xs">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Customers Directory ({mockCustomers.length})</h1>
        <p className="text-slate-500">Manage your omnichannel customer base, view order history and loyalty points.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-semibold">
            <tr>
              <th className="p-4">Customer</th>
              <th className="p-4">Contact Information</th>
              <th className="p-4">Location</th>
              <th className="p-4">Total Orders</th>
              <th className="p-4">Total Spent</th>
              <th className="p-4">Loyalty Points</th>
              <th className="p-4">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mockCustomers.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="p-4">
                  <span className="font-bold text-slate-900 block">{c.name}</span>
                  <span className="text-[10px] text-slate-400">{c.id}</span>
                </td>
                <td className="p-4 space-y-0.5">
                  <div className="flex items-center gap-1 text-slate-600"><Mail className="w-3 h-3 text-slate-400" /> {c.email}</div>
                  <div className="flex items-center gap-1 text-slate-500"><Phone className="w-3 h-3 text-slate-400" /> {c.phone}</div>
                </td>
                <td className="p-4 text-slate-700">{c.location}</td>
                <td className="p-4 font-bold text-slate-800">{c.totalOrders}</td>
                <td className="p-4 font-extrabold text-slate-900">₹{c.totalSpent}</td>
                <td className="p-4 font-bold text-indigo-600">{c.loyaltyPoints} pts</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    c.type === 'VIP' ? 'bg-purple-100 text-purple-700' :
                    c.type === 'Premium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {c.type}
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
