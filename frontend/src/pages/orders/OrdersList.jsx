import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  ShoppingBag,
  Eye,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Package,
  Truck,
  RotateCcw,
  Calendar,
  DollarSign,
  Tag,
  ExternalLink,
  Clock,
  Info,
  Layers,
  ArrowRight
} from 'lucide-react';
import { mockOrders } from '../../utils/mockData';
import { getOrdersApi } from '../../services/orderService';
import {
  triggerAmazonOrdersSyncApi,
  getAmazonOrderDetailsApi,
  syncSingleAmazonOrderApi,
  getAmazonOrderRefundsApi,
  getAmazonReturnsApi,
  triggerAmazonReturnsSyncApi,
  getAmazonReturnsStatusApi
} from '../../services/channelService';

export default function OrdersList() {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'returns'
  const [filterChannel, setFilterChannel] = useState('All');
  const [ordersSearch, setOrdersSearch] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingAmazon, setSyncingAmazon] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  // Drawer & Order Details State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [singleSyncing, setSingleSyncing] = useState(false);
  const [drawerRefunds, setDrawerRefunds] = useState(null);
  const [drawerMessage, setDrawerMessage] = useState(null);

  // Returns & Refunds State
  const [returnsList, setReturnsList] = useState([]);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [syncingReturns, setSyncingReturns] = useState(false);
  const [returnsStatus, setReturnsStatus] = useState(null);
  const [returnsSearch, setReturnsSearch] = useState('');
  const [returnsFilter, setReturnsFilter] = useState('All');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await getOrdersApi();
      const list = res?.orders || res?.data?.orders;
      if (Array.isArray(list) && list.length > 0) {
        setOrders(list);
      } else {
        setOrders(mockOrders);
      }
    } catch (err) {
      console.warn('Backend API fetch error, using mock data:', err.message);
      setOrders(mockOrders);
    } finally {
      setLoading(false);
    }
  };

  const fetchReturns = async () => {
    setReturnsLoading(true);
    try {
      const [returnsRes, statusRes] = await Promise.all([
        getAmazonReturnsApi({ search: returnsSearch, status: returnsFilter === 'All' ? undefined : returnsFilter }),
        getAmazonReturnsStatusApi().catch(() => null)
      ]);
      const list = returnsRes?.returns || returnsRes?.data?.returns || [];
      setReturnsList(list);
      if (statusRes?.status || statusRes?.data?.status) {
        setReturnsStatus(statusRes.status || statusRes.data.status);
      }
    } catch (err) {
      console.warn('Error fetching Amazon returns:', err.message);
      setReturnsList([]);
    } finally {
      setReturnsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    if (activeTab === 'returns') {
      fetchReturns();
    }
  }, [activeTab, returnsFilter]);

  const handleSyncAmazonOrders = async () => {
    setSyncingAmazon(true);
    setSyncMessage(null);
    try {
      const res = await triggerAmazonOrdersSyncApi();
      const summary = res?.summary || res?.data?.summary || {};
      setSyncMessage({
        type: 'success',
        text: `Amazon Orders sync complete: ${summary.totalFetched || 0} fetched, ${summary.totalCreated || 0} created, ${summary.totalUpdated || 0} updated.`,
      });
      await fetchOrders();
    } catch (err) {
      setSyncMessage({
        type: 'error',
        text: err.message || 'Failed to sync Amazon orders.',
      });
    } finally {
      setSyncingAmazon(false);
      setTimeout(() => setSyncMessage(null), 8000);
    }
  };

  const handleSyncReturns = async () => {
    setSyncingReturns(true);
    setSyncMessage(null);
    try {
      const res = await triggerAmazonReturnsSyncApi();
      const stats = res?.stats || res?.data?.stats || {};
      setSyncMessage({
        type: 'success',
        text: `Amazon Returns & Refunds sync complete: ${stats.totalReturnsSynced || 0} returns synced, ${stats.totalRefundEventsSynced || 0} financial refund events verified.`,
      });
      await fetchReturns();
    } catch (err) {
      setSyncMessage({
        type: 'error',
        text: err.message || 'Failed to sync Amazon returns.',
      });
    } finally {
      setSyncingReturns(false);
      setTimeout(() => setSyncMessage(null), 8000);
    }
  };

  const handleOpenOrderDetails = async (order) => {
    setSelectedOrder(order);
    setIsDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerRefunds(null);
    setDrawerMessage(null);

    const orderId = order.externalOrderId || order._id || order.id;
    const isAmazon = (order.channel || '').toUpperCase() === 'AMAZON' || (order.provider || '').toUpperCase() === 'AMAZON';

    if (isAmazon && orderId) {
      try {
        const [detailsRes, refundsRes] = await Promise.all([
          getAmazonOrderDetailsApi(orderId).catch(() => null),
          getAmazonOrderRefundsApi(orderId).catch(() => null)
        ]);

        if (detailsRes?.order || detailsRes?.data?.order) {
          setSelectedOrder(detailsRes.order || detailsRes.data.order);
        }
        if (refundsRes?.refunds || refundsRes?.data?.refunds) {
          setDrawerRefunds(refundsRes.refunds || refundsRes.data.refunds);
        }
      } catch (err) {
        console.warn('Error fetching detailed order info:', err.message);
      } finally {
        setDrawerLoading(false);
      }
    } else {
      setDrawerLoading(false);
    }
  };

  const handleSingleOrderSync = async (orderId) => {
    setSingleSyncing(true);
    setDrawerMessage(null);
    try {
      const res = await syncSingleAmazonOrderApi(orderId);
      if (res.success && (res.order || res.data?.order)) {
        const updated = res.order || res.data.order;
        setSelectedOrder(updated);
        setDrawerMessage({ type: 'success', text: 'Order details refreshed live from Amazon SP-API v2026-01-01.' });
        await fetchOrders();
      } else {
        throw new Error(res.message || 'Failed to refresh order.');
      }
    } catch (err) {
      setDrawerMessage({ type: 'error', text: err.message || 'Single order sync failed.' });
    } finally {
      setSingleSyncing(false);
      setTimeout(() => setDrawerMessage(null), 6000);
    }
  };

  const filtered = orders.filter((o) => {
    const channelName = o.channel ? o.channel.toUpperCase() : '';
    const filterName = filterChannel.toUpperCase();

    if (filterChannel !== 'All') {
      if (filterName === 'AMAZON_FBA') {
        if (!(channelName === 'AMAZON' && (o.fulfillmentChannel === 'FBA' || o.fulfillmentChannel === 'AFN'))) return false;
      } else if (filterName === 'AMAZON_FBM') {
        if (!(channelName === 'AMAZON' && (o.fulfillmentChannel === 'FBM' || o.fulfillmentChannel === 'MFN'))) return false;
      } else if (!channelName.includes(filterName) && !(filterName === 'OFFLINE' && channelName === 'POS')) {
        return false;
      }
    }

    if (ordersSearch.trim()) {
      const q = ordersSearch.toLowerCase().trim();
      const orderId = (o.externalOrderId || o.orderNumber || o.id || o._id || '').toLowerCase();
      const customer = (o.customer?.name || o.customer || '').toLowerCase();
      return orderId.includes(q) || customer.includes(q);
    }

    return true;
  });

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Orders & Returns Management</h1>
          <p className="text-xs text-slate-500">
            Multi-tenant Amazon SP-API v2026-01-01 order lifecycle, item details, tracking & read-only returns visibility.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          {activeTab === 'orders' ? (
            <button
              onClick={handleSyncAmazonOrders}
              disabled={syncingAmazon}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingAmazon ? 'animate-spin' : ''}`} />
              {syncingAmazon ? 'Syncing Orders...' : 'Sync Amazon Orders'}
            </button>
          ) : (
            <button
              onClick={handleSyncReturns}
              disabled={syncingReturns}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${syncingReturns ? 'animate-spin' : ''}`} />
              {syncingReturns ? 'Syncing Returns...' : 'Sync Returns & Refunds'}
            </button>
          )}
          <button
            onClick={activeTab === 'orders' ? fetchOrders : fetchReturns}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || returnsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Global Sync Notification Banner */}
      {syncMessage && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            syncMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {syncMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{syncMessage.text}</span>
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'orders'
              ? 'border-amber-500 text-amber-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          Orders ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'returns'
              ? 'border-purple-600 text-purple-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          Returns & Refunds ({returnsList.length})
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: ALL ORDERS VIEW                                         */}
      {/* ============================================================== */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by Order ID or Buyer..."
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="All">All Channels</option>
                <option value="Amazon">Amazon (All)</option>
                <option value="AMAZON_FBA">Amazon (FBA Fulfilled)</option>
                <option value="AMAZON_FBM">Amazon (FBM Fulfilled)</option>
                <option value="Flipkart">Flipkart</option>
                <option value="Myntra">Myntra</option>
                <option value="Website">Website</option>
                <option value="Offline">Offline POS</option>
              </select>
            </div>
            <div className="text-[11px] text-slate-500">
              Showing <span className="font-bold text-slate-800">{filtered.length}</span> of {orders.length} orders
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-semibold">
                <tr>
                  <th className="p-3.5">Order ID</th>
                  <th className="p-3.5">Customer & Security</th>
                  <th className="p-3.5">Channel & Fulfillment</th>
                  <th className="p-3.5">Amount</th>
                  <th className="p-3.5">Payment</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No orders found matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  filtered.map((ord, idx) => {
                    const orderId = ord.externalOrderId || ord.orderNumber || ord.id || ord._id;
                    const isAmazon = (ord.channel || '').toUpperCase() === 'AMAZON' || (ord.provider || '').toUpperCase() === 'AMAZON';
                    const customerName = isAmazon ? 'Amazon Customer' : ord.customer?.name || ord.customer || 'Customer';
                    const totalAmt = ord.totalAmount ?? ord.pricing?.totalAmount ?? ord.amount ?? 0;
                    const payMethod = ord.payment?.method || ord.paymentMethod || 'PREPAID';
                    const statusText = ord.orderStatus || ord.status || 'PENDING';
                    const originalAmzStatus = ord.originalAmazonStatus || ord.sourceMetadata?.originalAmazonStatus || ord.sourceMetadata?.amazonStatus || '';
                    const dateText = ord.purchaseDate
                      ? new Date(ord.purchaseDate).toLocaleDateString()
                      : ord.createdAt
                      ? new Date(ord.createdAt).toLocaleDateString()
                      : ord.date || 'Today';

                    const hasAddress = Boolean(
                      ord.shippingAddress &&
                      (ord.shippingAddress.addressLine1?.trim() || ord.shippingAddress.city?.trim())
                    );
                    const addressDisplay = hasAddress
                      ? `${ord.shippingAddress.addressLine1 ? ord.shippingAddress.addressLine1 + ', ' : ''}${ord.shippingAddress.city || ''}`
                      : 'Address not available';

                    return (
                      <tr
                        key={ord._id || ord.id || idx}
                        onClick={() => handleOpenOrderDetails(ord)}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900">{orderId}</div>
                          {ord.orderNumber && ord.externalOrderId && ord.orderNumber !== ord.externalOrderId && (
                            <div className="text-[10px] text-slate-400 font-mono">Ref: {ord.orderNumber}</div>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{customerName}</span>
                            {isAmazon && (
                              <span className="inline-flex items-center text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-mono" title="PII Protected by Amazon Policy">
                                <ShieldCheck className="w-2.5 h-2.5 text-amber-600 mr-0.5" />
                                Protected
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 italic">
                            {addressDisplay}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-700">{ord.channel}</span>
                            {isAmazon && ord.fulfillmentChannel && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  ord.fulfillmentChannel === 'FBA' || ord.fulfillmentChannel === 'AFN'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-indigo-100 text-indigo-800'
                                }`}
                              >
                                {ord.fulfillmentChannel === 'AFN' ? 'FBA' : ord.fulfillmentChannel === 'MFN' ? 'FBM' : ord.fulfillmentChannel}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 font-extrabold text-slate-900">₹{totalAmt}</td>
                        <td className="p-3.5 text-slate-500">{payMethod}</td>
                        <td className="p-3.5">
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-block text-center w-fit ${
                                statusText === 'DELIVERED' || statusText === 'COMPLETED' || statusText === 'Delivered'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : statusText === 'CANCELLED'
                                  ? 'bg-rose-100 text-rose-700'
                                  : statusText === 'UNKNOWN'
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {statusText}
                            </span>
                            {originalAmzStatus && isAmazon && originalAmzStatus !== statusText && (
                              <span className="text-[9px] text-slate-400 font-mono">
                                SP-API: {originalAmzStatus}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 text-slate-400">{dateText}</td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenOrderDetails(ord);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold transition-colors"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: AMAZON RETURNS & REFUNDS VIEW                           */}
      {/* ============================================================== */}
      {activeTab === 'returns' && (
        <div className="space-y-4">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Total Returns Tracked</span>
              <span className="text-xl font-extrabold text-slate-900 mt-1 block">
                {returnsList.length}
              </span>
              <span className="text-[10px] text-slate-400">Order & Report derived</span>
            </div>
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Total Refunds Verified</span>
              <span className="text-xl font-extrabold text-purple-600 mt-1 block">
                ₹{returnsList.reduce((acc, r) => acc + (Number(r.refundAmount) || 0), 0).toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400">Finances API verified</span>
            </div>
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Pending / In-Transit</span>
              <span className="text-xl font-extrabold text-amber-600 mt-1 block">
                {returnsList.filter((r) => r.status === 'REQUESTED' || r.status === 'IN_TRANSIT').length}
              </span>
              <span className="text-[10px] text-slate-400">Customer returning</span>
            </div>
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Completed & Restocked</span>
              <span className="text-xl font-extrabold text-emerald-600 mt-1 block">
                {returnsList.filter((r) => r.status === 'COMPLETED' || r.status === 'INSPECTED').length}
              </span>
              <span className="text-[10px] text-slate-400">Inventory reconciled</span>
            </div>
          </div>

          {/* Sandbox Notice Banner */}
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Amazon SP-API Read-Only Returns Specification:</span> Amazon SP-API does not offer a synchronous REST endpoint for initiating returns. Return and refund visibility is achieved by consolidating Orders API v2026-01-01 status, item-level cancellations, and the Finances API v0 RefundEventList. All actions are strictly read-only.
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search RMA, Order ID or SKU..."
                  value={returnsSearch}
                  onChange={(e) => setReturnsSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <select
                value={returnsFilter}
                onChange={(e) => setReturnsFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="All">All Return Statuses</option>
                <option value="REQUESTED">Requested</option>
                <option value="IN_TRANSIT">In-Transit</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div className="text-[11px] text-slate-500">
              Found <span className="font-bold text-slate-800">{returnsList.length}</span> returns
            </div>
          </div>

          {/* Returns Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-semibold">
                <tr>
                  <th className="p-3.5">RMA # / ID</th>
                  <th className="p-3.5">Amazon Order ID</th>
                  <th className="p-3.5">Item & SKU / ASIN</th>
                  <th className="p-3.5">Qty</th>
                  <th className="p-3.5">Reason & Condition</th>
                  <th className="p-3.5">Refund Amount</th>
                  <th className="p-3.5">Return Status</th>
                  <th className="p-3.5">Refund Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {returnsList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      <RotateCcw className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No Amazon returns or refund records found in the database.
                      <div className="text-[11px] text-slate-400 mt-1">
                        Click "Sync Returns & Refunds" to ingest customer returns from Amazon SP-API.
                      </div>
                    </td>
                  </tr>
                ) : (
                  returnsList.map((ret, idx) => {
                    const item = ret.items && ret.items[0] ? ret.items[0] : {};
                    const orderId = ret.externalOrderId || ret.orderId?._id || ret.orderId || 'N/A';
                    return (
                      <tr key={ret._id || idx} className="hover:bg-slate-50">
                        <td className="p-3.5 font-bold text-slate-900">
                          {ret.rmaNumber || `AMZ-RMA-${idx}`}
                        </td>
                        <td className="p-3.5 font-mono text-purple-700 font-semibold">
                          {orderId}
                        </td>
                        <td className="p-3.5 text-slate-800">
                          <div className="font-medium line-clamp-1">{item.title || item.sku || 'Amazon Item'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            SKU: {item.sku || 'N/A'} {item.asin ? `• ASIN: ${item.asin}` : ''}
                          </div>
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">{item.quantity || 1}</td>
                        <td className="p-3.5 text-slate-600">
                          <div>{item.reason || ret.reason || 'Customer Return'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Condition: {item.condition || 'Sellable'}
                          </div>
                        </td>
                        <td className="p-3.5 font-extrabold text-slate-900">
                          ₹{ret.refundAmount || 0}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ret.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : ret.status === 'IN_TRANSIT'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {ret.status || 'REQUESTED'}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-400">
                          {ret.refundDate ? new Date(ret.refundDate).toLocaleDateString() : 'Pending'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* DRAWER: DETAILED ORDER VIEW (Task 7 Phase 2 & 3 Requirements)  */}
      {/* ============================================================== */}
      {isDrawerOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    Order {selectedOrder.externalOrderId || selectedOrder.orderNumber || selectedOrder._id}
                    <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-mono">
                      {selectedOrder.channel || 'AMAZON'}
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Official SP-API v2026-01-01 Unified Order Detail & Logistics Breakdown
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notification inside Drawer */}
            {drawerMessage && (
              <div
                className={`p-3 text-xs flex items-center gap-2 ${
                  drawerMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                }`}
              >
                {drawerMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{drawerMessage.text}</span>
              </div>
            )}

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {drawerLoading ? (
                <div className="p-12 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                  Loading Amazon order items and financial refund details...
                </div>
              ) : (
                <>
                  {/* Section 1: Order Metadata & Status */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">Status</span>
                      <span className="font-extrabold text-slate-900 text-xs block mt-0.5">
                        {selectedOrder.orderStatus || selectedOrder.status || 'PENDING'}
                      </span>
                      {selectedOrder.sourceMetadata?.originalAmazonStatus && (
                        <span className="text-[9px] text-slate-400 font-mono">
                          SP-API: {selectedOrder.sourceMetadata.originalAmazonStatus}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">Purchase Date</span>
                      <span className="font-bold text-slate-800 text-xs block mt-0.5">
                        {selectedOrder.purchaseDate
                          ? new Date(selectedOrder.purchaseDate).toLocaleString()
                          : selectedOrder.createdAt
                          ? new Date(selectedOrder.createdAt).toLocaleString()
                          : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">Fulfillment</span>
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800">
                        {selectedOrder.fulfillmentChannel === 'AFN' || selectedOrder.fulfillmentChannel === 'FBA'
                          ? 'FBA (Amazon)'
                          : 'FBM (Merchant)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">Currency & Channel</span>
                      <span className="font-bold text-slate-800 text-xs block mt-0.5">
                        {selectedOrder.currency || 'INR'} • {selectedOrder.sourceMetadata?.salesChannel || 'Amazon.in'}
                      </span>
                    </div>
                  </div>

                  {/* Section 2: Fulfillment & Logistics */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-slate-500" />
                      Fulfillment & Shipment Details
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Carrier</span>
                        <span className="font-semibold text-slate-800">
                          {selectedOrder.shipmentDetails && selectedOrder.shipmentDetails[0]?.carrier
                            ? selectedOrder.shipmentDetails[0].carrier
                            : selectedOrder.fulfillmentChannel === 'FBA' || selectedOrder.fulfillmentChannel === 'AFN'
                            ? 'Amazon Logistics (ATS)'
                            : 'Standard Merchant Carrier'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Tracking Number</span>
                        <span className="font-mono text-slate-700">
                          {selectedOrder.shipmentDetails && selectedOrder.shipmentDetails[0]?.trackingNumber
                            ? selectedOrder.shipmentDetails[0].trackingNumber
                            : 'Tracking not assigned'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Ship Service Level</span>
                        <span className="font-semibold text-slate-800">
                          {selectedOrder.sourceMetadata?.shipServiceLevel || 'Standard'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Customer Information & Strict PII Safety */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                        Customer Information & Data Protection
                      </h3>
                      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                        PII Protected by SP-API Policy
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Customer: <span className="font-bold text-slate-800">Amazon Verified Buyer</span>
                    </p>
                    <div className="p-2.5 bg-slate-50 rounded-lg text-[11px] text-slate-600 italic">
                      {selectedOrder.shippingAddress &&
                      (selectedOrder.shippingAddress.addressLine1 || selectedOrder.shippingAddress.city) ? (
                        <div>
                          {selectedOrder.shippingAddress.addressLine1} {selectedOrder.shippingAddress.city}
                        </div>
                      ) : (
                        'Shipping address is omitted per Amazon SP-API PII Data Protection requirements.'
                      )}
                    </div>
                  </div>

                  {/* Section 4: Line Items Table */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-slate-500" />
                      Order Items ({selectedOrder.items?.length || 0})
                    </h3>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-semibold">
                          <tr>
                            <th className="p-2.5">Item</th>
                            <th className="p-2.5">SKU / ASIN</th>
                            <th className="p-2.5">Unit Price</th>
                            <th className="p-2.5">Ordered</th>
                            <th className="p-2.5">Shipped</th>
                            <th className="p-2.5">Cancelled</th>
                            <th className="p-2.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px]">
                          {selectedOrder.items && selectedOrder.items.length > 0 ? (
                            selectedOrder.items.map((it, i) => (
                              <tr key={i}>
                                <td className="p-2.5 font-medium text-slate-800 max-w-[200px] line-clamp-1">
                                  {it.title || it.name || 'Amazon Listing'}
                                </td>
                                <td className="p-2.5 font-mono text-slate-500 text-[10px]">
                                  {it.sku || 'N/A'} {it.asin ? `• ${it.asin}` : ''}
                                </td>
                                <td className="p-2.5 font-semibold text-slate-800">₹{it.price || 0}</td>
                                <td className="p-2.5 font-bold text-slate-900">{it.quantity || 1}</td>
                                <td className="p-2.5 text-emerald-600 font-semibold">{it.shippedQuantity || 0}</td>
                                <td className="p-2.5 text-rose-600 font-semibold">{it.cancelledQuantity || 0}</td>
                                <td className="p-2.5 font-bold text-slate-900 text-right">
                                  ₹{it.totalPrice || (it.price || 0) * (it.quantity || 1)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={7} className="p-4 text-center text-slate-400">
                                Line items embedded in SP-API response.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Section 5: Pricing Breakdown */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                      Financial Summary
                    </h3>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex justify-between text-slate-600">
                        <span>Items Subtotal</span>
                        <span className="font-semibold">₹{selectedOrder.subtotal || selectedOrder.totalAmount || 0}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Shipping Fee</span>
                        <span>₹{selectedOrder.shippingFee || 0}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Discounts & Promotions</span>
                        <span className="text-rose-600">-₹{selectedOrder.discount || 0}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Taxes & GST</span>
                        <span>₹{selectedOrder.tax || 0}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-xs">
                        <span>Total Paid by Buyer</span>
                        <span className="text-emerald-600 font-extrabold">₹{selectedOrder.totalAmount || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Section 6: Returns & Financial Refunds */}
                  <div className="p-4 bg-white rounded-xl border border-purple-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
                        Returns & Financial Refunds (SP-API Finances)
                      </h3>
                      {selectedOrder.refundStatus && (
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                            selectedOrder.refundStatus === 'FULL' || selectedOrder.refundStatus === 'REFUNDED'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {selectedOrder.refundStatus}
                        </span>
                      )}
                    </div>
                    {selectedOrder.refundAmount > 0 || (drawerRefunds && drawerRefunds.totalRefunded > 0) ? (
                      <div className="space-y-2 text-[11px]">
                        <div className="p-2.5 bg-purple-50 rounded-lg flex items-center justify-between">
                          <span className="text-purple-800 font-semibold">Total Verified Refund:</span>
                          <span className="text-purple-950 font-extrabold text-xs">
                            ₹{selectedOrder.refundAmount || drawerRefunds?.totalRefunded || 0}
                          </span>
                        </div>
                        {selectedOrder.refundDate && (
                          <div className="text-[10px] text-slate-400">
                            Refund Posted Date: {new Date(selectedOrder.refundDate).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        No financial refund events or customer returns posted for this order.
                      </p>
                    )}
                  </div>

                  {/* Section 7: Telemetry & Actions */}
                  <div className="p-3 bg-slate-100 rounded-xl flex items-center justify-between text-[10px] text-slate-500">
                    <div>
                      <span>SP-API Version: <span className="font-mono font-bold text-slate-700">2026-01-01</span></span>
                      {selectedOrder.updatedAt && (
                        <span className="ml-3">
                          Last Synced: {new Date(selectedOrder.updatedAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    {(selectedOrder.channel || '').toUpperCase() === 'AMAZON' && (
                      <button
                        onClick={() => handleSingleOrderSync(selectedOrder.externalOrderId || selectedOrder._id)}
                        disabled={singleSyncing}
                        className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-200 border border-slate-300 rounded font-semibold text-slate-700 transition-colors"
                      >
                        <RefreshCw className={`w-3 h-3 ${singleSyncing ? 'animate-spin' : ''}`} />
                        {singleSyncing ? 'Refreshing...' : 'Sync Live Details'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
