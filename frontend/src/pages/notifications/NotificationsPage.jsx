import React from 'react';
import { Bell, CheckCircle2, ShieldAlert } from 'lucide-react';
import { mockNotifications } from '../../utils/mockData';

export default function NotificationsPage() {
  return (
    <div className="space-y-6 font-sans text-xs">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Notifications Center</h1>
        <p className="text-slate-500">Stay updated with real-time alerts, order updates and channel sync notifications.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <span className="font-bold text-slate-900">All Notifications ({mockNotifications.length})</span>
          <button className="text-blue-600 font-semibold text-xs hover:underline">Mark all as read</button>
        </div>

        <div className="space-y-2">
          {mockNotifications.map((n) => (
            <div key={n.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-blue-600" />
                <div>
                  <h4 className="font-bold text-slate-800">{n.title}</h4>
                  <p className="text-slate-500">{n.text}</p>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">{n.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
