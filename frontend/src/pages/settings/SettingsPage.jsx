import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { updateMeApi } from '../../services/authService';

export default function SettingsPage() {
  const outletContext = useOutletContext() || {};
  const { currentUser, currentStore, refreshUser } = outletContext;

  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstin, setGstin] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    setBusinessName(currentStore?.businessName || currentUser?.storeName || '');
    setOwnerName(currentUser?.name || currentStore?.ownerName || '');
    setMobile(currentStore?.mobile || '');
    setGstin(currentStore?.gstin || '');
    setSupportEmail(currentStore?.email || currentUser?.email || '');
  }, [currentUser, currentStore]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg({ type: '', text: '' });

    try {
      const res = await updateMeApi({
        name: ownerName,
        businessName,
        mobile,
        gstin,
        supportEmail,
      });

      if (res?.success) {
        if (refreshUser) {
          await refreshUser();
        }
        setStatusMsg({ type: 'success', text: 'Profile changes saved successfully.' });
      } else {
        setStatusMsg({ type: 'error', text: res?.message || 'Failed to save profile changes.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to save profile changes.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-xs max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Platform Settings</h1>
        <p className="text-slate-500">Manage store profile, team permissions, marketplace credentials and subscription plans.</p>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="font-bold text-sm text-slate-900">Seller Business Profile</h2>
          {currentUser?.sellerId && (
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
              Seller ID: {currentUser.sellerId}
            </span>
          )}
        </div>

        {statusMsg.text && (
          <div
            className={`p-3 rounded-lg text-xs font-medium border ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Account Email (Login ID)</label>
            <input
              type="email"
              value={currentUser?.email || ''}
              disabled
              className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Owner Name</label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Business Name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Enter your business / store name"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Mobile Number</label>
            <input
              type="text"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">GSTIN Number</label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              placeholder="e.g. 07AAAAA0000A1Z5"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Support Email</label>
            <input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@yourstore.com"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Profile Changes'}
        </button>
      </form>
    </div>
  );
}
