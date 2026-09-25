import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, CheckCircle2, ArrowRight, AlertCircle, XCircle, Clock } from 'lucide-react';
import { getChannelsApi, syncChannelApi } from '../../services/channelService';

const SUPPORTED_CHANNELS = [
  { id: 'amazon', provider: 'AMAZON', name: 'Amazon', color: 'bg-amber-500', path: '/channels/amazon' },
  { id: 'flipkart', provider: 'FLIPKART', name: 'Flipkart', color: 'bg-blue-500', path: '/channels/flipkart' },
  { id: 'myntra', provider: 'MYNTRA', name: 'Myntra', color: 'bg-pink-500', path: '/channels/myntra' },
  { id: 'website', provider: 'SHOPIFY', name: 'Own Website', color: 'bg-indigo-500', path: '/channels/website' },
  { id: 'pos', provider: 'POS', name: 'POS / Offline Store', color: 'bg-emerald-500', path: '/channels/pos' },
];

export default function AllChannels() {
  const [dbConnections, setDbConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncMessage, setSyncMessage] = useState(null);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const res = await getChannelsApi();
      if (res && res.data && Array.isArray(res.data.channels)) {
        setDbConnections(res.data.channels);
      } else {
        setDbConnections([]);
      }
    } catch (err) {
      console.warn('Backend API fetch channels error:', err.message);
      setDbConnections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  // Compute status for each supported channel slot
  const mappedChannels = SUPPORTED_CHANNELS.map((channelDef) => {
    const conn = dbConnections.find((c) => {
      if (channelDef.provider === 'SHOPIFY') {
        return ['SHOPIFY', 'WOOCOMMERCE', 'WIX', 'CUSTOM_WEBSITE'].includes(c.provider);
      }
      return c.provider === channelDef.provider;
    });

    const isConnected = conn && conn.status === 'CONNECTED';
    return {
      ...channelDef,
      connectionId: conn ? conn._id : null,
      status: isConnected ? 'CONNECTED' : (conn?.status || 'NOT_CONNECTED'),
      displayName: conn?.displayName || channelDef.name,
      externalAccountId: conn?.externalAccountId || '',
      products: isConnected ? (conn?.metadata?.productsCount ?? 0) : 0,
      orders: isConnected ? (conn?.metadata?.ordersCount ?? 0) : 0,
      lastSyncAt: conn?.lastSyncAt || null,
      isError: conn?.status === 'ERROR' || conn?.status === 'REAUTH_REQUIRED',
    };
  });

  const connectedChannels = mappedChannels.filter((c) => c.status === 'CONNECTED');
  const connectedCount = connectedChannels.length;
  const syncedProductsCount = connectedChannels.reduce((sum, c) => sum + (c.products || 0), 0);
  const totalOrdersCount = connectedChannels.reduce((sum, c) => sum + (c.orders || 0), 0);
  const syncHealthText = connectedCount > 0 ? '100%' : 'N/A';

  const handleSyncAll = async () => {
    setSyncMessage(null);
    if (connectedCount === 0) {
      setSyncMessage({ type: 'error', text: 'No connected channels available to sync. Please connect a channel first.' });
      return;
    }

    setLoading(true);
    try {
      for (const ch of connectedChannels) {
        if (ch.connectionId) {
          await syncChannelApi(ch.connectionId, 'FULL');
        }
      }
      setSyncMessage({ type: 'success', text: 'All connected channels synced successfully.' });
      await fetchChannels();
    } catch (err) {
      setSyncMessage({ type: 'error', text: err.message || 'Failed to sync channels.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">All Sales Channels ({mappedChannels.length})</h1>
          <p className="text-xs text-slate-500">Connect, sync and manage all your marketplace, e-commerce storefront and offline store accounts.</p>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Sync All Channels
        </button>
      </div>

      {syncMessage && (
        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${syncMessage.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {syncMessage.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {syncMessage.text}
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Connected Channels</span>
          <span className="text-xl font-extrabold text-slate-900 mt-1 block">
            {connectedCount}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Synced Products</span>
          <span className="text-xl font-extrabold text-slate-900 mt-1 block">{syncedProductsCount.toLocaleString()}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Total Orders (This Month)</span>
          <span className="text-xl font-extrabold text-slate-900 mt-1 block">{totalOrdersCount.toLocaleString()}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-slate-400 font-semibold block text-[10px] uppercase">Overall Sync Health</span>
          <span className={`text-xl font-extrabold mt-1 block ${connectedCount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
            {syncHealthText}
          </span>
        </div>
      </div>

      {/* Channels Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        {mappedChannels.map((ch) => {
          const initial = ch.name ? ch.name[0].toUpperCase() : 'C';
          const isConnected = ch.status === 'CONNECTED';
          const isPending = ch.status === 'PENDING';

          return (
            <div key={ch.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${ch.color} text-white flex items-center justify-center font-bold text-sm`}>
                    {initial}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{ch.name}</h3>
                    <span className={`text-[10px] font-semibold flex items-center gap-1 ${isConnected ? 'text-emerald-600' : isPending ? 'text-amber-600' : ch.isError ? 'text-rose-600' : 'text-slate-400'}`}>
                      {isConnected ? (
                        <CheckCircle2 className="w-3 h-3 inline" />
                      ) : isPending ? (
                        <Clock className="w-3 h-3 inline text-amber-600" />
                      ) : ch.isError ? (
                        <AlertCircle className="w-3 h-3 inline" />
                      ) : (
                        <XCircle className="w-3 h-3 inline text-slate-400" />
                      )}
                      {isConnected ? 'Connected' : isPending ? 'Pending Auth' : ch.isError ? ch.status : 'Not Connected'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Products</span>
                  <span className="font-bold text-slate-800">{isConnected ? ch.products : '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Orders (30d)</span>
                  <span className="font-bold text-slate-800">{isConnected ? ch.orders : '-'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                <span>
                  {isConnected && ch.lastSyncAt
                    ? `Synced ${new Date(ch.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : isConnected
                    ? 'Connected'
                    : 'Not Connected'}
                </span>
                <Link to={ch.path} className="text-blue-600 font-semibold hover:underline flex items-center gap-0.5">
                  {isConnected ? 'Manage' : 'Connect'} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

