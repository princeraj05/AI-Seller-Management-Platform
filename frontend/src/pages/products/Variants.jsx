import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, RefreshCw, AlertCircle, Package } from 'lucide-react';
import { getVariantsApi, createVariantApi, deleteVariantApi, getProductsApi } from '../../services/productService';

export default function Variants() {
  const [variants, setVariants] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [sku, setSku] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('0');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [varRes, prodRes] = await Promise.all([
        getVariantsApi('all'),
        getProductsApi(),
      ]);

      const varList = varRes?.data?.variants || varRes?.variants || (Array.isArray(varRes) ? varRes : []);
      const prodList = prodRes?.data?.products || prodRes?.products || (Array.isArray(prodRes) ? prodRes : []);

      setVariants(varList);
      setProducts(prodList);
      if (prodList.length > 0 && !selectedProductId) {
        setSelectedProductId(prodList[0]._id || prodList[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load variants data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateVariant = async (e) => {
    e.preventDefault();
    setModalError(null);

    if (!selectedProductId) {
      setModalError('Please select a parent product.');
      return;
    }
    if (!sku.trim()) {
      setModalError('Variant SKU is required.');
      return;
    }
    if (price === '' || isNaN(Number(price)) || Number(price) < 0) {
      setModalError('Valid variant price (>= 0) is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        sku: sku.trim().toUpperCase(),
        size: size.trim(),
        color: color.trim(),
        price: Number(price),
        stock: Number(stock) || 0,
      };

      const res = await createVariantApi(selectedProductId, payload);
      const created = res?.data?.variant || res?.variant || res;
      if (created) {
        setVariants((prev) => [...prev, created]);
        setShowAddModal(false);
        setSku('');
        setSize('');
        setColor('');
        setPrice('');
        setStock('0');
      }
    } catch (err) {
      setModalError(err.message || 'Failed to create variant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteVariant = async (productId, variantId, variantSku) => {
    if (!window.confirm(`Are you sure you want to delete variant SKU "${variantSku}"?`)) {
      return;
    }
    try {
      await deleteVariantApi(productId, variantId);
      setVariants((prev) => prev.filter((v) => (v._id || v.id) !== variantId));
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Product Variants Management</h1>
          <p className="text-xs text-slate-500">Manage size, color, material variants and individual stock allocations.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
            title="Refresh Variants"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Variant Option
          </button>
        </div>
      </div>

      {/* Add Variant Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-md space-y-4 text-xs shadow-xl">
            <h2 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
              Create New Variant
            </h2>
            {modalError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}
            <form onSubmit={handleCreateVariant} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Parent Product *</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="">-- Select Product --</option>
                  {products.map((p) => (
                    <option key={p._id || p.id} value={p._id || p.id}>
                      {p.title || p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Variant SKU *</label>
                <input
                  type="text"
                  placeholder="e.g. KUR-001-BL-S"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Size</label>
                  <input
                    type="text"
                    placeholder="e.g. S, M, L, XL"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Color</label>
                  <input
                    type="text"
                    placeholder="e.g. Blue, Red"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Price (₹) *</label>
                  <input
                    type="number"
                    placeholder="1299"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Stock (pcs)</label>
                  <input
                    type="number"
                    placeholder="50"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-70"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save Variant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loading & Error States */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-600">Loading product variants...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center space-y-3 text-red-700 text-xs">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
          <p className="font-bold">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700"
          >
            Retry Loading Variants
          </button>
        </div>
      ) : variants.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3 text-xs">
          <Package className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 text-sm">No product variants found</h3>
          <p className="text-slate-500">Create variants for size, color, or style options.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Add First Variant
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-semibold">
              <tr>
                <th className="p-4">SKU</th>
                <th className="p-4">Color</th>
                <th className="p-4">Size</th>
                <th className="p-4">Price</th>
                <th className="p-4">Stock</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {variants.map((v) => {
                const vId = v._id || v.id;
                return (
                  <tr key={vId || v.sku} className="hover:bg-slate-50 font-sans">
                    <td className="p-4 font-bold text-slate-900">{v.sku}</td>
                    <td className="p-4 text-slate-700">{v.color || '—'}</td>
                    <td className="p-4 font-bold text-slate-800">{v.size || '—'}</td>
                    <td className="p-4 font-semibold text-slate-900">₹{v.price}</td>
                    <td className="p-4 text-slate-700">{v.stock || 0} pcs</td>
                    <td className="p-4">
                      <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {v.status || 'Active'}
                      </span>
                    </td>
                    <td className="p-4 text-right font-sans">
                      <button
                        onClick={() => handleDeleteVariant(v.productId, vId, v.sku)}
                        className="text-slate-400 hover:text-red-600 p-1"
                        title="Delete Variant"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
