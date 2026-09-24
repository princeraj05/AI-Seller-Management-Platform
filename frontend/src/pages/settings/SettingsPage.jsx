import React from 'react';
import { Settings, User, Building, CreditCard, Shield } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6 font-sans text-xs max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Platform Settings</h1>
        <p className="text-slate-500">Manage store profile, team permissions, marketplace credentials and subscription plans.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3">Seller Business Profile</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Business Name</label>
            <input type="text" defaultValue="Bhartiye Crafts" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Owner Name</label>
            <input type="text" defaultValue="Prince Raj" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">GSTIN Number</label>
            <input type="text" defaultValue="07AAAAA0000A1Z5" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Support Email</label>
            <input type="email" defaultValue="support@bhartiyecrafts.com" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs" />
          </div>
        </div>
        <button className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg text-xs">Save Profile Changes</button>
      </div>
    </div>
  );
}
