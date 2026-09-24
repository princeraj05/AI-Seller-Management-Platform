import React, { useState, useEffect } from 'react';
import { ArrowLeft, Globe, CheckCircle2, XCircle, LogOut, PlusCircle, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getChannelsApi, connectChannelApi, disconnectChannelApi } from '../../services/channelService';

const PLATFORMS = [
  { provider: 'SHOPIFY', name: 'Shopify', placeholder: 'yourstore.myshopify.com' },
  { provider: 'WOOCOMMERCE', name: 'WooCommerce', placeholder: 'https://yourdomain.com' },
  { provider: 'WIX', name: 'Wix Store', placeholder: 'https://wixsite.com/yourstore' },
  { provider: 'CUSTOM_WEBSITE', name: 'Custom Webhook API', placeholder: 'REST API Key / Endpoint' },
];

export default function WebsiteChannel() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [activeModalProvider, setActiveModalProvider] = useState(null);
  const [formData, setFormData] = useState({ displayName: '', externalAccountId: '' });

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const res = await getChannelsApi();
      if (res && res.data && Array.isArray(res.data.channels)) {
        setConnections(res.data.channels);
      } else {
        setConnections([]);
      }
    } catch (err) {
      console.warn('Error fetching website connections:', err.message);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleDisconnect = async (connId) => {
    setMessage(null);
    setActionLoading(true);
    try {
      await disconnectChannelApi(connId);
      setMessage({ type: 'success', text: 'Store connection removed successfully.' });
      await fetchConnections();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to disconnect store.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConnectSubmit = async (e) => {
    e.preventDefault();
    if (!activeModalProvider) return;
    setMessage(null);
    setActionLoading(true);
    try {
      await connectChannelApi(activeModalProvider.provider, {
        displayName: formData.displayName || `${activeModalProvider.name} Integration`,
        externalAccountId: formData.externalAccountId,
        credentials: { storeUrl: formData.externalAccountId },
      });
      setMessage({ type: 'success', text: `${activeModalProvider.name} connected successfully!` });
      setActiveModalProvider(null);
      setFormData({ displayName: '', externalAccountId: '' });
      await fetchConnections();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect store.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-xs">
      <div className="flex items-center justify-between">
        <Link to="/channels" className="font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Channels
        </Link>
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
          <Globe className="w-8 h-8 text-indigo-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Own Website / Storefront Integration</h1>
            <p className="text-slate-500">Connect Shopify, WooCommerce, Wix or Custom Website API</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {PLATFORMS.map((plat) => {
            const conn = connections.find((c) => c.provider === plat.provider && c.status === 'CONNECTED');
            const isConnected = !!conn;

            return (
              <div key={plat.provider} className="p-4 border border-slate-200 rounded-xl space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900">{plat.name}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1 ${
                        isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isConnected ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {isConnected ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] truncate">
                    {isConnected ? conn.externalAccountId || conn.displayName : 'No store linked'}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  {isConnected ? (
                    <button
                      onClick={() => handleDisconnect(conn._id)}
                      disabled={actionLoading}
                      className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold py-1.5 rounded text-[11px] flex items-center justify-center gap-1"
                    >
                      <LogOut className="w-3 h-3" /> Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setActiveModalProvider(plat);
                        setFormData({ displayName: `${plat.name} Integration`, externalAccountId: '' });
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1.5 rounded text-[11px] flex items-center justify-center gap-1"
                    >
                      <PlusCircle className="w-3 h-3" /> Connect {plat.name}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {activeModalProvider && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Connect {activeModalProvider.name}</h2>
            <form onSubmit={handleConnectSubmit} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Store URL / Domain / Endpoint</label>
                <input
                  type="text"
                  value={formData.externalAccountId}
                  onChange={(e) => setFormData({ ...formData, externalAccountId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  placeholder={activeModalProvider.placeholder}
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModalProvider(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Connecting...' : 'Connect Store'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

