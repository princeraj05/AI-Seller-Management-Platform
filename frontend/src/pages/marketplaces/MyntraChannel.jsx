import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, XCircle, LogOut, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getChannelsApi, syncChannelApi, disconnectChannelApi, connectChannelApi } from '../../services/channelService';

export default function MyntraChannel() {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [formData, setFormData] = useState({ displayName: 'Myntra Partner Account', externalAccountId: '' });

  const fetchConnection = async () => {
    setLoading(true);
    try {
      const res = await getChannelsApi();
      if (res && res.data && Array.isArray(res.data.channels)) {
        const conn = res.data.channels.find((c) => c.provider === 'MYNTRA' && c.status === 'CONNECTED');
        setConnection(conn || null);
      } else {
        setConnection(null);
      }
    } catch (err) {
      console.warn('Error fetching Myntra connection:', err.message);
      setConnection(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnection();
  }, []);

  const handleSyncNow = async () => {
    setMessage(null);
    if (!connection || connection.status !== 'CONNECTED') {
      setMessage({ type: 'error', text: 'Myntra is not connected.' });
      return;
    }

    setActionLoading(true);
    try {
      await syncChannelApi(connection._id, 'FULL');
      setMessage({ type: 'success', text: 'Myntra synchronization completed successfully.' });
      await fetchConnection();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to sync Myntra.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    setMessage(null);
    setActionLoading(true);
    try {
      await disconnectChannelApi(connection._id);
      setMessage({ type: 'success', text: 'Myntra channel disconnected successfully.' });
      await fetchConnection();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to disconnect Myntra.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConnectSubmit = async (e) => {
    e.preventDefault();
    if (!formData.externalAccountId) {
      setMessage({ type: 'error', text: 'Please enter a valid Seller ID.' });
      return;
    }
    setMessage(null);
    setActionLoading(true);
    try {
      await connectChannelApi('MYNTRA', {
        displayName: formData.displayName || 'Myntra Partner Account',
        externalAccountId: formData.externalAccountId,
        credentials: { partnerToken: 'myntra-partner-token' },
      });
      setMessage({ type: 'success', text: 'Myntra account connected successfully!' });
      setShowConnectModal(false);
      await fetchConnection();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect Myntra account.' });
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
                <LogOut className="w-4 h-4" /> Disconnect Myntra
              </button>
              <button
                onClick={handleSyncNow}
                disabled={actionLoading}
                className="bg-pink-600 hover:bg-pink-700 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} /> Sync Myntra Now
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowConnectModal(true)}
              className="bg-pink-600 hover:bg-pink-700 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> Connect Myntra Account
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
          <div className="w-12 h-12 rounded-xl bg-pink-500 text-white font-extrabold text-xl flex items-center justify-center">
            M
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Myntra Partner Account</h1>
            <p className="text-slate-500">
              {isConnected
                ? `Seller ID: ${connection.externalAccountId || 'Connected'} • Connected since ${
                    connection.createdAt ? new Date(connection.createdAt).toLocaleDateString() : 'Active'
                  }`
                : 'Myntra Partner Account • Not Connected'}
            </p>
          </div>
          {isConnected ? (
            <span className="ml-auto bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Connected
            </span>
          ) : (
            <span className="ml-auto bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> Not Connected
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-2">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Products Listed</span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 block">
              {isConnected ? (connection.metadata?.productsCount ?? 0) : '0'}
            </span>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Orders (30 Days)</span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 block">
              {isConnected ? (connection.metadata?.ordersCount ?? 0) : '0'}
            </span>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Inventory Sync</span>
            <span className="text-xl font-extrabold text-emerald-600 mt-1 block">
              {isConnected ? `${connection.metadata?.inventoryCount ?? 0} items` : '0 items'}
            </span>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Returns</span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 block">
              {isConnected ? `${connection.metadata?.returnsCount ?? 0} open` : '0 open'}
            </span>
          </div>
        </div>

        {!isConnected && (
          <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 mt-4">
            <div>
              <h3 className="font-bold text-pink-900">Connect Your Myntra Partner Account</h3>
              <p className="text-pink-700 text-xs mt-0.5">
                Link your Myntra Brand Portal account to synchronize fashion listings and orders.
              </p>
            </div>
            <button
              onClick={() => setShowConnectModal(true)}
              className="bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs px-4 py-2 rounded-lg whitespace-nowrap shadow-sm"
            >
              Start Connection Setup
            </button>
          </div>
        )}
      </div>

      {showConnectModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Connect Myntra Brand Portal</h2>
            <form onSubmit={handleConnectSubmit} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  placeholder="e.g. Myntra Fashion Store"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Myntra Partner ID</label>
                <input
                  type="text"
                  value={formData.externalAccountId}
                  onChange={(e) => setFormData({ ...formData, externalAccountId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  placeholder="e.g. MYN-PARTNER-77"
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
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Connecting...' : 'Authorize & Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

