import React, { useState, useEffect } from 'react';
import { ArrowLeft, Building, ShoppingCart, CheckCircle2, XCircle, LogOut, PlusCircle, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getChannelsApi, connectChannelApi, disconnectChannelApi } from '../../services/channelService';

export default function POSChannel() {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [formData, setFormData] = useState({ displayName: 'POS / Offline Store', externalAccountId: 'Main Store' });

  const fetchConnection = async () => {
    setLoading(true);
    try {
      const res = await getChannelsApi();
      if (res && res.data && Array.isArray(res.data.channels)) {
        const conn = res.data.channels.find((c) => c.provider === 'POS' && c.status === 'CONNECTED');
        setConnection(conn || null);
      } else {
        setConnection(null);
      }
    } catch (err) {
      console.warn('Error fetching POS connection:', err.message);
      setConnection(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnection();
  }, []);

  const handleDisconnect = async () => {
    if (!connection) return;
    setMessage(null);
    setActionLoading(true);
    try {
      await disconnectChannelApi(connection._id);
      setMessage({ type: 'success', text: 'POS connection removed successfully.' });
      await fetchConnection();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to disconnect POS.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConnectSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setActionLoading(true);
    try {
      await connectChannelApi('POS', {
        displayName: formData.displayName || 'POS / Offline Store',
        externalAccountId: formData.externalAccountId || 'Main Store',
        credentials: { posTerminalId: 'POS-TERM-01' },
      });
      setMessage({ type: 'success', text: 'POS Store connected successfully!' });
      setShowConnectModal(false);
      await fetchConnection();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect POS Store.' });
    } finally {
      setActionLoading(false);
    }
  };

  const isConnected = connection && connection.status === 'CONNECTED';

  return (
    <div className="space-y-6 font-sans text-xs">
      <div className="flex items-center justify-between">
        <Link to="/channels" className="font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Channels
        </Link>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <button
                onClick={handleDisconnect}
                disabled={actionLoading}
                className="border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" /> Disconnect POS
              </button>
              <Link to="/pos/billing" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
                <ShoppingCart className="w-4 h-4" /> Open POS Billing
              </Link>
            </>
          ) : (
            <button
              onClick={() => setShowConnectModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> Connect POS Store
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg flex items-center gap-2 ${
            message.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {message.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <Building className="w-8 h-8 text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">POS / Offline Store — MyBill</h1>
            <p className="text-slate-500">
              {isConnected
                ? `${connection.externalAccountId || 'Main Store'} • Connected since ${
                    connection.createdAt ? new Date(connection.createdAt).toLocaleDateString() : 'Active'
                  }`
                : 'POS / Offline Store • Not Connected'}
            </p>
          </div>
          {isConnected ? (
            <span className="ml-auto bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Active & Live Sync
            </span>
          ) : (
            <span className="ml-auto bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> Not Connected
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 pt-2">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Today's Offline Sales</span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 block">
              {isConnected ? `₹ ${connection.metadata?.todaySales ?? 0}` : '₹ 0'}
            </span>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Bills Generated (30d)</span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 block">
              {isConnected ? (connection.metadata?.billsGenerated ?? 0) : '0'}
            </span>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Offline Revenue</span>
            <span className="text-xl font-extrabold text-emerald-600 mt-1 block">
              {isConnected ? `₹ ${connection.metadata?.totalRevenue ?? 0}` : '₹ 0'}
            </span>
          </div>
        </div>

        {!isConnected && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 mt-4">
            <div>
              <h3 className="font-bold text-emerald-900">Connect Physical Retail Store / POS</h3>
              <p className="text-emerald-700 text-xs mt-0.5">
                Enable MyBill POS terminal integration to calculate offline billing, update stock levels, and track sales in real-time.
              </p>
            </div>
            <button
              onClick={() => setShowConnectModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg whitespace-nowrap shadow-sm"
            >
              Start POS Connection
            </button>
          </div>
        )}
      </div>

      {showConnectModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Connect POS Store</h2>
            <form onSubmit={handleConnectSubmit} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Store / Terminal Name</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  placeholder="e.g. Main Retail Store - Delhi"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Store Location / Terminal ID</label>
                <input
                  type="text"
                  value={formData.externalAccountId}
                  onChange={(e) => setFormData({ ...formData, externalAccountId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  placeholder="e.g. Delhi Retail Counter 01"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Connecting...' : 'Connect POS Terminal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

