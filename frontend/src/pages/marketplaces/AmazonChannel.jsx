import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  LogOut,
  PlusCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  KeyRound,
  Globe,
  Radio,
  Search,
  Package,
  Layers,
  Settings,
  AlertTriangle,
  Info,
  DollarSign,
  Tag,
  Boxes,
  TrendingUp,
  UploadCloud,
} from 'lucide-react';
import AmazonListingPublisher from './AmazonListingPublisher';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getAmazonStatusApi,
  initiateAmazonOAuthApi,
  connectAmazonManualApi,
  disconnectAmazonApi,
  testAmazonConnectionApi,
  getAmazonListingsApi,
  searchAmazonCatalogApi,
  triggerAmazonSyncApi,
  getAmazonSyncStatusApi,
  getAmazonInventoryApi,
  triggerAmazonInventorySyncApi,
  getAmazonInventoryStatusApi,
  getAmazonPricingApi,
  triggerAmazonPricingSyncApi,
  getAmazonPricingStatusApi,
} from '../../services/channelService';

export default function AmazonChannel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [testingLoading, setTestingLoading] = useState(false);
  const [syncingLoading, setSyncingLoading] = useState(false);
  const [syncingInvLoading, setSyncingInvLoading] = useState(false);
  const [syncingPriceLoading, setSyncingPriceLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectTab, setConnectTab] = useState('oauth'); // 'oauth' | 'manual'

  // Main UI Tab: 'listings' | 'inventory' | 'pricing' | 'catalog' | 'settings' | 'publish'
  const validTabs = ['listings', 'inventory', 'pricing', 'catalog', 'settings', 'publish'];
  const [activeTab, setActiveTab] = useState(validTabs.includes(urlTab) ? urlTab : 'listings');

  // Synchronize activeTab when URL searchParams change (handles direct links and browser back/forward)
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  // Listings State
  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsPagination, setListingsPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [listingsSearch, setListingsSearch] = useState('');

  // Inventory State
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryPagination, setInventoryPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryStatus, setInventoryStatus] = useState(null);

  // Pricing State
  const [pricingItems, setPricingItems] = useState([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingPagination, setPricingPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [pricingSearch, setPricingSearch] = useState('');
  const [pricingStatus, setPricingStatus] = useState(null);

  // Catalog Search State
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogIdType, setCatalogIdType] = useState('KEYWORDS'); // 'KEYWORDS' | 'ASIN' | 'UPC' | 'EAN' | 'ISBN'
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogPagination, setCatalogPagination] = useState(null);

  // General Sync Status State
  const [syncStatus, setSyncStatus] = useState(null);

  // Manual Connection Form Data
  const [formData, setFormData] = useState({
    displayName: 'Amazon India Store (Sandbox)',
    sellingPartnerId: '',
    refreshToken: '',
    marketplaceId: 'A21TJRUUN4KGV',
    marketplaceRegion: 'eu',
  });

  const fetchConnection = async () => {
    setLoading(true);
    try {
      const res = await getAmazonStatusApi();
      const conn = res?.connection || res?.data?.connection || null;
      if (conn && (conn.status === 'CONNECTED' || conn.connected)) {
        setConnection(conn);
      } else if (conn && conn.status) {
        setConnection(conn);
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

  const fetchSyncStatus = async () => {
    try {
      const [general, inv, price] = await Promise.all([
        getAmazonSyncStatusApi().catch(() => null),
        getAmazonInventoryStatusApi().catch(() => null),
        getAmazonPricingStatusApi().catch(() => null),
      ]);
      if (general?.data) setSyncStatus(general.data);
      if (inv?.data) setInventoryStatus(inv.data);
      if (price?.data) setPricingStatus(price.data);
    } catch (e) {
      console.warn('Error fetching sync telemetry:', e.message);
    }
  };

  const fetchListings = async (page = 1, search = '') => {
    setListingsLoading(true);
    try {
      const res = await getAmazonListingsApi({
        page,
        limit: listingsPagination.limit,
        search: search.trim(),
      });
      if (res && res.data) {
        setListings(res.data.listings || []);
        if (res.data.pagination) setListingsPagination(res.data.pagination);
      }
    } catch (err) {
      console.warn('Error fetching listings:', err.message);
      setListings([]);
    } finally {
      setListingsLoading(false);
    }
  };

  const fetchInventory = async (page = 1, search = '') => {
    setInventoryLoading(true);
    try {
      const res = await getAmazonInventoryApi({
        page,
        limit: inventoryPagination.limit,
        search: search.trim(),
      });
      if (res && res.data) {
        setInventoryItems(res.data.inventory || []);
        if (res.data.pagination) setInventoryPagination(res.data.pagination);
      }
    } catch (err) {
      console.warn('Error fetching inventory:', err.message);
      setInventoryItems([]);
    } finally {
      setInventoryLoading(false);
    }
  };

  const fetchPricing = async (page = 1, search = '') => {
    setPricingLoading(true);
    try {
      const res = await getAmazonPricingApi({
        page,
        limit: pricingPagination.limit,
        search: search.trim(),
      });
      if (res && res.data) {
        setPricingItems(res.data.pricing || []);
        if (res.data.pagination) setPricingPagination(res.data.pagination);
      }
    } catch (err) {
      console.warn('Error fetching pricing:', err.message);
      setPricingItems([]);
    } finally {
      setPricingLoading(false);
    }
  };

  useEffect(() => {
    fetchConnection();
    fetchSyncStatus();

    // Check if redirected from OAuth callback
    const oauthStatus = searchParams.get('status');
    const oauthMessage = searchParams.get('message');
    if (oauthStatus === 'connected') {
      setMessage({ type: 'success', text: 'Amazon Seller Central OAuth authorization completed successfully!' });
      searchParams.delete('status');
      setSearchParams(searchParams, { replace: true });
    } else if (oauthStatus === 'error') {
      setMessage({ type: 'error', text: oauthMessage || 'Amazon OAuth authorization failed.' });
      searchParams.delete('status');
      searchParams.delete('message');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (connection && connection.status === 'CONNECTED') {
      if (activeTab === 'listings') fetchListings(1, listingsSearch);
      if (activeTab === 'inventory') fetchInventory(1, inventorySearch);
      if (activeTab === 'pricing') fetchPricing(1, pricingSearch);
    }
  }, [connection, activeTab]);

  const handleTestConnection = async () => {
    setMessage(null);
    setTestingLoading(true);
    try {
      const res = await testAmazonConnectionApi();
      if (res.success && res.data?.authenticated) {
        setMessage({ type: 'success', text: res.message || 'Amazon SP-API Sandbox connection verified!' });
      } else {
        setMessage({
          type: 'error',
          text: res.message || res.data?.message || 'Amazon connection test failed.',
        });
      }
      await fetchConnection();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Connection test failed.' });
    } finally {
      setTestingLoading(false);
    }
  };

  const handleTriggerListingsSync = async () => {
    setMessage(null);
    if (!connection || connection.status !== 'CONNECTED') {
      setMessage({ type: 'error', text: 'Amazon is not connected.' });
      return;
    }

    setSyncingLoading(true);
    try {
      const res = await triggerAmazonSyncApi({ marketplaceId: connection.marketplaceId });
      if (res.success) {
        const stats = res.data?.stats;
        setMessage({
          type: 'success',
          text: `Amazon listings sync completed: ${stats?.totalFetched || 0} fetched, ${stats?.totalCreated || 0} created, ${stats?.totalUpdated || 0} updated.`,
        });
        await fetchConnection();
        await fetchSyncStatus();
        await fetchListings(1, listingsSearch);
      } else {
        setMessage({ type: 'error', text: res.message || 'Amazon listings synchronization failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to sync Amazon listings.' });
    } finally {
      setSyncingLoading(false);
    }
  };

  const handleTriggerInventorySync = async () => {
    setMessage(null);
    if (!connection || connection.status !== 'CONNECTED') {
      setMessage({ type: 'error', text: 'Amazon is not connected.' });
      return;
    }

    setSyncingInvLoading(true);
    try {
      const res = await triggerAmazonInventorySyncApi({ marketplaceId: connection.marketplaceId });
      if (res.success) {
        const stats = res.data?.stats;
        const totalFetched = stats?.totalFetched || 0;
        if (totalFetched === 0 || res.data?.status === 'EMPTY') {
          setMessage({
            type: 'warning',
            text: res.message || 'Amazon returned 0 inventory records for this marketplace. In Sandbox mode, FBA inventory summaries are empty by default unless test SKUs are provisioned.',
          });
        } else {
          setMessage({
            type: 'success',
            text: `Amazon inventory sync completed: ${totalFetched} fetched, ${stats?.totalCreated || 0} created, ${stats?.totalUpdated || 0} updated.`,
          });
        }
        await fetchSyncStatus();
        await fetchInventory(1, inventorySearch);
      } else {
        setMessage({ type: 'error', text: res.message || 'Amazon inventory synchronization failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to sync Amazon inventory.' });
    } finally {
      setSyncingInvLoading(false);
    }
  };

  const handleTriggerPricingSync = async () => {
    setMessage(null);
    if (!connection || connection.status !== 'CONNECTED') {
      setMessage({ type: 'error', text: 'Amazon is not connected.' });
      return;
    }

    setSyncingPriceLoading(true);
    try {
      const res = await triggerAmazonPricingSyncApi({ marketplaceId: connection.marketplaceId });
      if (res.success) {
        const stats = res.data?.stats;
        setMessage({
          type: 'success',
          text: `Amazon pricing sync completed: ${stats?.totalFetched || 0} fetched, ${stats?.totalCreated || 0} created, ${stats?.totalUpdated || 0} updated.`,
        });
        await fetchSyncStatus();
        await fetchPricing(1, pricingSearch);
      } else {
        setMessage({ type: 'error', text: res.message || 'Amazon pricing synchronization failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to sync Amazon pricing.' });
    } finally {
      setSyncingPriceLoading(false);
    }
  };

  const handleCatalogSearchSubmit = async (e) => {
    e.preventDefault();
    if (!catalogQuery.trim()) return;

    setCatalogLoading(true);
    setMessage(null);
    try {
      const params = {};
      if (catalogIdType === 'KEYWORDS') {
        params.keywords = catalogQuery.trim();
      } else {
        params.identifiers = catalogQuery.trim();
        params.identifiersType = catalogIdType;
      }

      const res = await searchAmazonCatalogApi(params);
      if (res.success && res.data) {
        setCatalogResults(res.data.items || []);
        setCatalogPagination(res.data.pagination || null);
        if ((res.data.items || []).length === 0) {
          setMessage({ type: 'info', text: 'No catalog items found matching your query.' });
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Catalog search failed.' });
      setCatalogResults([]);
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Amazon Seller Central integration? Stored tokens will be permanently deleted.')) {
      return;
    }
    setMessage(null);
    setActionLoading(true);
    try {
      await disconnectAmazonApi();
      setMessage({ type: 'success', text: 'Amazon channel disconnected and credentials purged.' });
      await fetchConnection();
      setListings([]);
      setInventoryItems([]);
      setPricingItems([]);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to disconnect Amazon.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartOAuth = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await initiateAmazonOAuthApi({ region: 'eu' });
      if (res.data?.authorizationUrl) {
        window.location.href = res.data.authorizationUrl;
      } else {
        throw new Error('Authorization URL could not be generated.');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to start Amazon OAuth flow.' });
      setActionLoading(false);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!formData.refreshToken || !formData.refreshToken.trim()) {
      setMessage({ type: 'error', text: 'Please enter a valid LWA Refresh Token.' });
      return;
    }
    setMessage(null);
    setActionLoading(true);
    try {
      const res = await connectAmazonManualApi({
        displayName: formData.displayName,
        sellingPartnerId: formData.sellingPartnerId.trim(),
        refreshToken: formData.refreshToken.trim(),
        marketplaceId: formData.marketplaceId,
        marketplaceRegion: formData.marketplaceRegion,
      });

      if (res.success) {
        setMessage({
          type: 'success',
          text: 'Amazon Sandbox account connected & verified successfully via LWA Refresh Token!',
        });
        setShowConnectModal(false);
        setFormData((prev) => ({ ...prev, refreshToken: '' }));
        const immediateConn = res?.connection || res?.channel || res?.data?.connection || res?.data?.channel;
        if (immediateConn) {
          setConnection(immediateConn);
        }
        await fetchConnection();
      } else {
        throw new Error(res.message || 'Failed to connect Amazon account.');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect Amazon account.' });
    } finally {
      setActionLoading(false);
    }
  };

  const isConnected = connection && (connection.status === 'CONNECTED' || connection.connected === true);
  const isPending = connection && connection.status === 'PENDING';
  const isError = connection && (connection.status === 'ERROR' || connection.status === 'REAUTH_REQUIRED');

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link to="/channels" className="font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Channels
        </Link>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <button
                onClick={handleDisconnect}
                disabled={actionLoading || testingLoading || syncingLoading || syncingInvLoading || syncingPriceLoading}
                className="border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" /> Disconnect
              </button>
              <button
                onClick={handleTestConnection}
                disabled={actionLoading || testingLoading || syncingLoading || syncingInvLoading || syncingPriceLoading}
                className="border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Radio className={`w-4 h-4 text-emerald-600 ${testingLoading ? 'animate-pulse' : ''}`} />
                {testingLoading ? 'Testing...' : 'Test Connection'}
              </button>

              <button
                onClick={() => setActiveTab('publish')}
                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm"
              >
                <PlusCircle className="w-4 h-4" />
                Create Amazon Listing
              </button>

              {activeTab === 'listings' && (
                <button
                  onClick={handleTriggerListingsSync}
                  disabled={actionLoading || testingLoading || syncingLoading}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingLoading ? 'animate-spin' : ''}`} />
                  {syncingLoading ? 'Syncing Listings...' : 'Sync Listings Now'}
                </button>
              )}

              {activeTab === 'inventory' && (
                <button
                  onClick={handleTriggerInventorySync}
                  disabled={actionLoading || testingLoading || syncingInvLoading}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingInvLoading ? 'animate-spin' : ''}`} />
                  {syncingInvLoading ? 'Syncing FBA/FBM...' : 'Sync Inventory Now'}
                </button>
              )}

              {activeTab === 'pricing' && (
                <button
                  onClick={handleTriggerPricingSync}
                  disabled={actionLoading || testingLoading || syncingPriceLoading}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingPriceLoading ? 'animate-spin' : ''}`} />
                  {syncingPriceLoading ? 'Syncing Offers...' : 'Sync Pricing Now'}
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => setShowConnectModal(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> {connection?.status ? 'Manage Setup' : 'Connect Amazon Account'}
            </button>
          )}
        </div>
      </div>

      {/* Notifications Banner */}
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
            <Info className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Main Connection Status Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500 text-white font-extrabold text-xl flex items-center justify-center shrink-0">
            A
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">Amazon Seller Central (SP-API)</h1>
            <p className="text-slate-500 truncate">
              {isConnected
                ? `Merchant / Partner ID: ${connection.sellingPartnerId || 'Active'} • Region: Europe / India (eu) • Marketplace: Amazon India`
                : isPending
                ? `Pending Seller Central Authorization`
                : isError
                ? `Connection Error • ${connection.lastError || 'Authorization required'}`
                : 'Multi-Tenant Amazon Selling Partner API Integration • Sandbox Ready'}
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

        {/* Sync Summary & Metadata Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-1">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Listings & Inventory</span>
            <span className="text-lg font-extrabold text-slate-900 mt-0.5 block">
              {listingsPagination.total} listings • {inventoryStatus?.totalRecords || 0} stocks
            </span>
            <span className="text-[10px] text-slate-400">FBA & FBM partitioned</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Pricing Snapshots</span>
            <span className="text-sm font-extrabold text-emerald-600 mt-0.5 block flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              {pricingStatus?.totalRecords || 0} items tracked
            </span>
            <span className="text-[10px] text-slate-400">Buy Box & lowest offers</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Marketplace & Region</span>
            <span className="text-sm font-extrabold text-slate-900 mt-0.5 block flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-amber-500" /> Amazon India
            </span>
            <span className="text-[10px] text-slate-400">ID: {connection?.marketplaceId || 'A21TJRUUN4KGV'} • eu</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Security Engine</span>
            <span className="text-sm font-extrabold text-emerald-600 mt-0.5 block flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> AES-256-GCM
            </span>
            <span className="text-[10px] text-slate-400">Durable TTL OAuth replay protection</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="border-b border-slate-200 flex items-center gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('listings')}
          className={`pb-3 font-semibold text-xs border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'listings'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          Seller Listings ({listingsPagination.total})
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 font-semibold text-xs border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'inventory'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          Inventory (FBA / FBM)
        </button>

        <button
          onClick={() => setActiveTab('pricing')}
          className={`pb-3 font-semibold text-xs border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'pricing'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Pricing & Buy Box
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`pb-3 font-semibold text-xs border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'catalog'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Search className="w-4 h-4" />
          Catalog Discovery
        </button>

        <button
          onClick={() => setActiveTab('publish')}
          className={`pb-3 font-semibold text-xs border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'publish'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          Publish Listing (Sandbox)
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 font-semibold text-xs border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'settings'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          Configuration
        </button>
      </div>

      {/* TAB 1: SELLER LISTINGS TABLE */}
      {activeTab === 'listings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={listingsSearch}
                onChange={(e) => {
                  setListingsSearch(e.target.value);
                  fetchListings(1, e.target.value);
                }}
                placeholder="Search by title, SKU, or ASIN..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchListings(listingsPagination.page, listingsSearch)}
                disabled={listingsLoading}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                title="Refresh table"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${listingsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-3">Seller SKU</th>
                  <th className="py-2.5 px-3">ASIN</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Price</th>
                  <th className="py-2.5 px-3">Qty</th>
                  <th className="py-2.5 px-3">Master Link</th>
                  <th className="py-2.5 px-3">Last Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listingsLoading ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
                      Loading Amazon listings...
                    </td>
                  </tr>
                ) : listings.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-slate-400">
                      <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-600">No synchronized listings found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Click "Sync Listings Now" to import seller listings from your Amazon Seller Central account.
                      </p>
                    </td>
                  </tr>
                ) : (
                  listings.map((item) => (
                    <tr key={item._id || item.externalSku} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2 max-w-xs">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-8 h-8 rounded border border-slate-200 object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <span className="font-medium text-slate-900 truncate" title={item.title}>
                            {item.title || 'Untitled Amazon Listing'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                        {item.externalSku}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-amber-700">
                        {item.externalProductId || item.asin || 'N/A'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'PUBLISHED' || item.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        ₹{item.price || 0}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-700">
                        {item.quantity || 0}
                      </td>
                      <td className="py-2.5 px-3">
                        {item.productId ? (
                          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                            Linked
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Unlinked</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {item.lastSyncedAt ? new Date(item.lastSyncedAt).toLocaleTimeString() : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {listingsPagination.pages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-slate-500">
              <span>
                Page {listingsPagination.page} of {listingsPagination.pages} ({listingsPagination.total} items)
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={listingsPagination.page <= 1 || listingsLoading}
                  onClick={() => fetchListings(listingsPagination.page - 1, listingsSearch)}
                  className="px-2.5 py-1 border border-slate-200 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={listingsPagination.page >= listingsPagination.pages || listingsLoading}
                  onClick={() => fetchListings(listingsPagination.page + 1, listingsSearch)}
                  className="px-2.5 py-1 border border-slate-200 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INVENTORY (FBA / FBM) TABLE */}
      {activeTab === 'inventory' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                <strong>Amazon Inventory Breakdown (Read-Only Snapshot):</strong> Distinguishes FBA fulfillment stock (Fulfillable, Inbound, Reserved, Unfulfillable) and FBM merchant stock.
              </span>
            </div>
            <span className="text-[11px] text-slate-400 shrink-0">Does not overwrite internal master stock</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={inventorySearch}
                onChange={(e) => {
                  setInventorySearch(e.target.value);
                  fetchInventory(1, e.target.value);
                }}
                placeholder="Search by SKU, ASIN, or product name..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              onClick={() => fetchInventory(inventoryPagination.page, inventorySearch)}
              disabled={inventoryLoading}
              className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${inventoryLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Seller SKU</th>
                  <th className="py-2.5 px-3">ASIN</th>
                  <th className="py-2.5 px-3">Channel</th>
                  <th className="py-2.5 px-3">Fulfillable</th>
                  <th className="py-2.5 px-3">Inbound</th>
                  <th className="py-2.5 px-3">Reserved</th>
                  <th className="py-2.5 px-3">Unfulfillable</th>
                  <th className="py-2.5 px-3">Merchant (FBM)</th>
                  <th className="py-2.5 px-3">Total Qty</th>
                  <th className="py-2.5 px-3">Last Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventoryLoading ? (
                  <tr>
                    <td colSpan="10" className="py-8 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
                      Loading Amazon inventory data...
                    </td>
                  </tr>
                ) : inventoryItems.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-8 text-center text-slate-400">
                      <Boxes className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-600">No inventory snapshots found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Click "Sync Inventory Now" to fetch live FBA Inventory Summaries and FBM stock levels.
                      </p>
                    </td>
                  </tr>
                ) : (
                  inventoryItems.map((item) => (
                    <tr key={item._id || item.externalSku} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {item.externalSku}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-amber-700">
                        {item.asin || 'N/A'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.fulfillmentChannel === 'FBA'
                              ? 'bg-blue-100 text-blue-700'
                              : item.fulfillmentChannel === 'FBM'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.fulfillmentChannel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-emerald-600">
                        {item.fulfillableQuantity || 0}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-700">
                        {item.inboundQuantity || 0}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-amber-600">
                        {item.reservedQuantity || 0}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-rose-600">
                        {item.unfulfillableQuantity || 0}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-purple-700">
                        {item.sellerFulfilledQuantity || 0}
                      </td>
                      <td className="py-2.5 px-3 font-extrabold text-slate-900">
                        {item.totalQuantity || 0}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {item.lastSyncedAt ? new Date(item.lastSyncedAt).toLocaleTimeString() : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {inventoryPagination.pages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-slate-500">
              <span>
                Page {inventoryPagination.page} of {inventoryPagination.pages} ({inventoryPagination.total} records)
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={inventoryPagination.page <= 1 || inventoryLoading}
                  onClick={() => fetchInventory(inventoryPagination.page - 1, inventorySearch)}
                  className="px-2.5 py-1 border border-slate-200 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={inventoryPagination.page >= inventoryPagination.pages || inventoryLoading}
                  onClick={() => fetchInventory(inventoryPagination.page + 1, inventorySearch)}
                  className="px-2.5 py-1 border border-slate-200 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PRICING & BUY BOX TABLE */}
      {activeTab === 'pricing' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>
                <strong>Amazon Product Pricing Snapshots (Read-Only):</strong> Displays our current offer, Buy Box price, lowest market price, and competitive references.
              </span>
            </div>
            <span className="text-[11px] text-slate-400 shrink-0">Does not overwrite internal master prices</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={pricingSearch}
                onChange={(e) => {
                  setPricingSearch(e.target.value);
                  fetchPricing(1, e.target.value);
                }}
                placeholder="Search by SKU, ASIN, or title..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              onClick={() => fetchPricing(pricingPagination.page, pricingSearch)}
              disabled={pricingLoading}
              className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${pricingLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Item / SKU</th>
                  <th className="py-2.5 px-3">ASIN</th>
                  <th className="py-2.5 px-3">Our Listing Price</th>
                  <th className="py-2.5 px-3">Shipping</th>
                  <th className="py-2.5 px-3">Landed Price</th>
                  <th className="py-2.5 px-3">Buy Box Price</th>
                  <th className="py-2.5 px-3">Lowest Offer</th>
                  <th className="py-2.5 px-3">Competitive Ref</th>
                  <th className="py-2.5 px-3">Total Offers</th>
                  <th className="py-2.5 px-3">Observed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pricingLoading ? (
                  <tr>
                    <td colSpan="10" className="py-8 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
                      Loading Amazon pricing snapshots...
                    </td>
                  </tr>
                ) : pricingItems.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-8 text-center text-slate-400">
                      <TrendingUp className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-600">No pricing snapshots found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Click "Sync Pricing Now" to retrieve competitive offer snapshots and Buy Box status.
                      </p>
                    </td>
                  </tr>
                ) : (
                  pricingItems.map((item) => (
                    <tr key={item._id || item.externalSku || item.asin} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="max-w-xs truncate font-medium text-slate-900" title={item.title || item.externalSku}>
                          {item.externalSku ? (
                            <span className="font-mono font-bold block">{item.externalSku}</span>
                          ) : null}
                          <span className="text-[11px] text-slate-500 truncate block">{item.title || 'Amazon Item'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-amber-700">
                        {item.asin}
                      </td>
                      <td className="py-2.5 px-3 font-extrabold text-slate-900">
                        {item.ownListingPrice !== null ? `₹${item.ownListingPrice}` : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        ₹{item.shippingPrice || 0}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {item.landedPrice !== null ? `₹${item.landedPrice}` : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3">
                        {item.buyBoxPrice !== null ? (
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-emerald-600">₹{item.buyBoxPrice}</span>
                            {item.isBuyBoxWinner && (
                              <span className="bg-amber-100 text-amber-800 text-[9px] font-extrabold px-1.5 py-0.2 rounded" title="You own the Buy Box">
                                WON
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {item.lowestOfferPrice !== null ? `₹${item.lowestOfferPrice}` : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {item.competitivePrice !== null ? `₹${item.competitivePrice}` : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {item.totalOfferCount || 0}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {item.observedAt ? new Date(item.observedAt).toLocaleTimeString() : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pricingPagination.pages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-slate-500">
              <span>
                Page {pricingPagination.page} of {pricingPagination.pages} ({pricingPagination.total} items)
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={pricingPagination.page <= 1 || pricingLoading}
                  onClick={() => fetchPricing(pricingPagination.page - 1, pricingSearch)}
                  className="px-2.5 py-1 border border-slate-200 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={pricingPagination.page >= pricingPagination.pages || pricingLoading}
                  onClick={() => fetchPricing(pricingPagination.page + 1, pricingSearch)}
                  className="px-2.5 py-1 border border-slate-200 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: AMAZON CATALOG DISCOVERY SEARCH */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Amazon Catalog Items Discovery (v2022-04-01)</h2>
              <p className="text-slate-500 text-xs">
                Search the global Amazon product catalog using keywords or standardized product identifiers. (Read-only catalog reference).
              </p>
            </div>

            <form onSubmit={handleCatalogSearchSubmit} className="flex flex-col sm:flex-row gap-2">
              <div className="w-full sm:w-44">
                <select
                  value={catalogIdType}
                  onChange={(e) => setCatalogIdType(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="KEYWORDS">Keywords Search</option>
                  <option value="ASIN">ASIN</option>
                  <option value="UPC">UPC</option>
                  <option value="EAN">EAN</option>
                  <option value="ISBN">ISBN</option>
                </select>
              </div>
              <div className="relative flex-1">
                <input
                  type="text"
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  placeholder={
                    catalogIdType === 'KEYWORDS'
                      ? 'e.g. wireless earbuds, cotton t-shirt...'
                      : `Enter ${catalogIdType} (e.g. B08N5WRWNW)`
                  }
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={catalogLoading}
                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {catalogLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    Search Catalog
                  </>
                )}
              </button>
            </form>
          </div>

          {catalogResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {catalogResults.map((item) => (
                <div
                  key={item.asin}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow transition-shadow flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                        ASIN: {item.asin}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        {item.brand || 'Generic'}
                      </span>
                    </div>

                    <div className="flex gap-3">
                      {item.mainImageUrl ? (
                        <img
                          src={item.mainImageUrl}
                          alt={item.title}
                          className="w-16 h-16 rounded border border-slate-100 object-contain p-1 shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                          <Package className="w-6 h-6" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-xs line-clamp-2" title={item.title}>
                          {item.title}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Product Type: <span className="font-semibold text-slate-700">{item.productType}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {item.salesRanks && item.salesRanks.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                      Rank #{item.salesRanks[0]?.rank} in {item.salesRanks[0]?.title}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: SETTINGS & PERMISSIONS */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
            Amazon SP-API Integration Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <span className="font-semibold text-slate-700 block">FBA Inventory API</span>
              <span className="text-[11px] text-slate-500 block">
                Version: <strong>v1 (getInventorySummaries)</strong> • Permissions: Read-only fulfillable, inbound, reserved, and unfulfillable stock breakdown.
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <span className="font-semibold text-slate-700 block">Product Pricing API</span>
              <span className="text-[11px] text-slate-500 block">
                Version: <strong>v0 (getItemOffers / getListingOffers)</strong> • Permissions: Read-only Buy Box price, lowest offers, landed price, and competitor counts.
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <span className="font-semibold text-slate-700 block">Catalog & Listings APIs</span>
              <span className="text-[11px] text-slate-500 block">
                Versions: <strong>Catalog Items 2022-04-01 • Listings Items 2021-08-01</strong>. Read-only search and listing synchronization.
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <span className="font-semibold text-slate-700 block">Multi-Tenant Isolation & Replay Defense</span>
              <span className="text-[11px] text-slate-500 block">
                Durable atomic TTL-indexed collection (<code>ConsumedOAuthNonce</code>) + in-memory fallback. Credentials encrypted with AES-256-GCM.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: PUBLISH LISTING STUDIO (SANDBOX WORKFLOW) */}
      {activeTab === 'publish' && (
        <AmazonListingPublisher
          connection={connection}
          initialProductId={searchParams.get('productId')}
          onListingCreated={() => fetchListings(1, '')}
        />
      )}

      {/* Connection Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-x-hidden">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Connect Amazon Seller Central</h2>
              <button
                onClick={() => setShowConnectModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {/* Tabs for OAuth vs Manual */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setConnectTab('oauth')}
                className={`py-2 px-4 font-semibold text-xs border-b-2 transition-colors ${
                  connectTab === 'oauth'
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Seller Central OAuth (Public Flow)
              </button>
              <button
                type="button"
                onClick={() => setConnectTab('manual')}
                className={`py-2 px-4 font-semibold text-xs border-b-2 transition-colors ${
                  connectTab === 'manual'
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Sandbox Self-Authorization (Developer Central)
              </button>
            </div>

            {connectTab === 'oauth' && (
              <div className="space-y-4 py-2">
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs space-y-1">
                  <p className="font-semibold flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5" /> Official Amazon App Authorization
                  </p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    You will be redirected to Amazon Seller Central (India) to authorize AI Seller Management Platform.
                    Once granted, Amazon redirects back with an authorization code that is securely exchanged and encrypted.
                  </p>
                </div>
                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConnectModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold hover:bg-slate-50 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleStartOAuth}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold shadow-sm text-xs flex items-center gap-1.5"
                  >
                    {actionLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Generating Consent URL...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-3.5 h-3.5" />
                        Authorize with Seller Central
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {connectTab === 'manual' && (
              <form onSubmit={handleManualSubmit} className="space-y-4 py-1">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 text-xs space-y-1">
                  <p className="font-semibold text-slate-900">Developer Central Sandbox Testing</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    In Developer Central, click <strong>"Edit App" &rarr; "Self-Authorize"</strong> to generate a Sandbox LWA Refresh Token.
                    Paste the token below to connect immediately without waiting for Appstore review.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    placeholder="e.g. Amazon India Sandbox"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Selling Partner ID / Merchant ID</label>
                  <input
                    type="text"
                    value={formData.sellingPartnerId}
                    onChange={(e) => setFormData({ ...formData, sellingPartnerId: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    placeholder="e.g. A3QW12EXAMPLE"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    LWA Refresh Token <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={formData.refreshToken}
                    onChange={(e) => setFormData({ ...formData, refreshToken: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    placeholder="Atzr|IwEB..."
                    required
                  />
                  <span className="text-[10px] text-slate-400">Tokens are encrypted with AES-256-GCM and never shared with the frontend.</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Marketplace</label>
                    <select
                      value={formData.marketplaceId}
                      onChange={(e) => setFormData({ ...formData, marketplaceId: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="A21TJRUUN4KGV">India (A21TJRUUN4KGV)</option>
                      <option value="ATVPDKIKX0DER">US (ATVPDKIKX0DER)</option>
                      <option value="A1F83G8C2ARO7P">UK (A1F83G8C2ARO7P)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Region</label>
                    <select
                      value={formData.marketplaceRegion}
                      onChange={(e) => setFormData({ ...formData, marketplaceRegion: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="eu">Europe / India (eu)</option>
                      <option value="na">North America (na)</option>
                      <option value="fe">Far East (fe)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConnectModal(false)}
                    disabled={actionLoading}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold hover:bg-slate-50 text-xs disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold shadow-sm text-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {actionLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Verifying & Connecting...
                      </>
                    ) : (
                      'Save & Verify Connection'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
