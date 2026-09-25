import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, XCircle, LogOut, PlusCircle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getChannelsApi, syncChannelApi, disconnectChannelApi, connectChannelApi } from '../../services/channelService';

export default function AmazonChannel() {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [formData, setFormData] = useState({ displayName: 'Amazon Seller Account', externalAccountId: '' });

  const fetchConnection = async () => {
    setLoading(true);
    try {
      const res = await getChannelsApi();
      if (res && res.data && Array.isArray(res.data.channels)) {
        const conn = res.data.channels.find((c) => c.provider === 'AMAZON');
        setConnection(conn || null);
      } else {
        setConnection(null);
      }
    } catch (err) {
      console.warn('Error fetching Amazon connection:', err.message);
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
      setMessage({ type: 'error', text: 'Amazon is not connected.' });
      return;
    }

    setActionLoading(true);
    try {
      await syncChannelApi(connection._id, 'FULL');
      setMessage({ type: 'success', text: 'Amazon synchronization completed successfully.' });
      await fetchConnection();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to sync Amazon.' });
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
      setMessage({ type: 'success', text: 'Amazon channel disconnected successfully.' });
      await fetchConnection();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to disconnect Amazon.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConnectSubmit = async (e) => {
    e.preventDefault();
    if (!formData.externalAccountId || !formData.externalAccountId.trim()) {
      setMessage({ type: 'error', text: 'Please enter a valid Seller ID.' });
      return;
    }
    setMessage(null);
    setActionLoading(true);
    try {
      const res = await connectChannelApi('AMAZON', {
        displayName: formData.displayName || 'Amazon Seller Account',
        externalAccountId: formData.externalAccountId.trim(),
        credentials: { sellerId: formData.externalAccountId.trim() },
      });

      const createdConn = res?.data?.channel || res?.channel;
      if (createdConn && createdConn.status === 'CONNECTED') {
        setMessage({ type: 'success', text: 'Amazon account connected & verified successfully!' });
      } else if (createdConn && createdConn.status === 'PENDING') {
        setMessage({
          type: 'info',
          text: createdConn.lastError || 'Amazon Seller ID registered. Amazon SP-API authorization required to activate sync.',
        });
      } else if (createdConn && createdConn.status === 'ERROR') {
        setMessage({
          type: 'error',
          text: createdConn.lastError || 'Amazon SP-API verification failed. Please verify credentials.',
        });
      } else {
        setMessage({ type: 'info', text: 'Amazon connection setup saved. Authorization pending.' });
      }

      setShowConnectModal(false);
      await fetchConnection();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect Amazon account.' });
    } finally {
      setActionLoading(false);
    }
  };

  const isConnected = connection && connection.status === 'CONNECTED';
  const isPending = connection && connection.status === 'PENDING';
  const isError = connection && connection.status === 'ERROR';

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
                <LogOut className="w-4 h-4" /> Disconnect Amazon
              </button>
              <button
                onClick={handleSyncNow}
                disabled={actionLoading}
                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} /> Sync Amazon Now
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowConnectModal(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> {connection ? 'Manage Setup' : 'Connect Amazon Account'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg flex items-center gap-2 ${
            message.type === 'error'
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : message.type === 'info'
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {message.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : message.type === 'info' ? (
            <Clock className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500 text-white font-extrabold text-xl flex items-center justify-center shrink-0">
            A
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">Amazon Seller Account</h1>
            <p className="text-slate-500 truncate">
              {isConnected
                ? `Seller ID: ${connection.externalAccountId || 'Connected'} • Connected since ${
                    connection.createdAt ? new Date(connection.createdAt).toLocaleDateString() : 'Active'
                  }`
                : isPending
                ? `Seller ID: ${connection.externalAccountId || 'Registered'} • Awaiting Authorization`
                : isError
                ? `Seller ID: ${connection.externalAccountId || 'Error'} • Connection Error`
                : 'Amazon Seller Account • Not Connected'}
            </p>
          </div>
          {isConnected ? (
            <span className="ml-auto bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold flex items-center gap-1 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" /> Connected & Active
            </span>
          ) : isPending ? (
            <span className="ml-auto bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-bold flex items-center gap-1 shrink-0">
              <Clock className="w-3.5 h-3.5" /> Pending Authorization
            </span>
          ) : isError ? (
            <span className="ml-auto bg-rose-100 text-rose-700 px-3 py-1 rounded-full font-bold flex items-center gap-1 shrink-0">
              <AlertCircle className="w-3.5 h-3.5" /> Connection Error
            </span>
          ) : (
            <span className="ml-auto bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold flex items-center gap-1 shrink-0">
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
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 mt-4">
            <div>
              <h3 className="font-bold text-amber-900">
                {isPending ? 'Seller Central Authorization Pending' : 'Connect Your Amazon Seller Central Account'}
              </h3>
              <p className="text-amber-700 text-xs mt-0.5">
                {isPending
                  ? connection.lastError || 'Seller ID is registered. Complete Amazon SP-API OAuth / LWA token authorization to enable live sync.'
                  : 'Link your Amazon SP-API account to sync inventory, prices, and orders automatically.'}
              </p>
            </div>
            <button
              onClick={() => setShowConnectModal(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-lg whitespace-nowrap shadow-sm shrink-0"
            >
              {isPending ? 'Update Credentials' : 'Start Connection Setup'}
            </button>
          </div>
        )}
      </div>

      {showConnectModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-x-hidden">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-slate-900 break-words">Connect Amazon Seller Central</h2>
            <form onSubmit={handleConnectSubmit} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  placeholder="e.g. Amazon India Store"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Amazon Merchant / Seller ID</label>
                <input
                  type="text"
                  value={formData.externalAccountId}
                  onChange={(e) => setFormData({ ...formData, externalAccountId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  placeholder="e.g. A3QW12EXAMPLE"
                  required
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  disabled={actionLoading}
                  className="w-full sm:w-auto px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold hover:bg-slate-50 transition-colors text-xs disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold shadow-sm transition-colors text-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {actionLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Authorize & Connect'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


