import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { getProductByIdApi, updateProductApi } from '../../services/productService';

export default function EditProduct() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [sku, setSku] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [suggestedTitle, setSuggestedTitle] = useState('');

  const fetchProduct = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getProductByIdApi(id);
      const item = res?.data?.product || res?.product || res;
      if (item) {
        setName(item.title || item.name || '');
        setDescription(item.description || '');
        setPrice(item.masterPrice !== undefined ? String(item.masterPrice) : '');
        setStock(item.stock !== undefined ? String(item.stock) : '');
        setSku(item.sku || '');
        setBrand(item.brand || 'Bhartiye Crafts');
        setCategory(item.categoryName || item.category || 'Fashion');
      } else {
        setError('Product not found.');
      }
    } catch (err) {
      setError(err.message || 'Failed to load product details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const handleAiTitle = () => {
    setSuggestedTitle(`${brand || 'Bhartiye Crafts'} Premium ${name || 'Item'} | Handcrafted & Authentic`);
  };

  const handleSaveChanges = async (e) => {
    e?.preventDefault();
    setSaveError(null);

    if (!name.trim()) {
      setSaveError('Product Name cannot be empty.');
      return;
    }
    if (price === '' || isNaN(Number(price)) || Number(price) < 0) {
      setSaveError('Please enter a valid master price (>= 0).');
      return;
    }

    setIsSaving(true);
    try {
      const updateData = {
        title: name.trim(),
        description: description.trim(),
        masterPrice: Number(price),
        stock: Number(stock) || 0,
      };

      await updateProductApi(id, updateData);
      navigate('/products');
    } catch (err) {
      setSaveError(err.message || 'Failed to save product changes.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3 font-sans">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <p className="text-xs font-semibold text-slate-600">Loading product for editing...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 font-sans">
        <Link to="/products" className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Products
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center space-y-3 text-red-700 text-xs">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
          <p className="font-bold text-sm">{error}</p>
          <button
            onClick={fetchProduct}
            className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/products')} className="text-slate-400 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Edit Product — {sku}</h1>
            <p className="text-xs text-slate-500">Update product info. Changes will sync across connected marketplace channels.</p>
          </div>
        </div>
        <button
          onClick={handleSaveChanges}
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-70"
        >
          {isSaving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save Changes
            </>
          )}
        </button>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-4 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
          <span>{saveError}</span>
        </div>
      )}

      <form onSubmit={handleSaveChanges} className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
        {/* Main Edit Form */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3">Basic Information</h2>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Product Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Full Description</label>
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Master Price (₹) *</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Stock (pcs)</label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Category</label>
              <input
                type="text"
                value={category}
                disabled
                className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 text-xs"
              />
            </div>
          </div>
        </div>

        {/* AI Content Assistant Sidebar */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h2 className="font-bold text-sm text-slate-900">AI Content Assistant</h2>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleAiTitle}
              className="w-full p-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold text-left text-xs"
            >
              ✨ Improve Title with AI
            </button>
          </div>

          {suggestedTitle && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="font-bold text-[11px] text-slate-700 block">Suggested AI Title:</span>
              <p className="text-[11px] text-slate-600 leading-snug">{suggestedTitle}</p>
              <button
                type="button"
                onClick={() => { setName(suggestedTitle); setSuggestedTitle(''); }}
                className="bg-indigo-600 text-white font-semibold px-3 py-1 rounded text-[10px]"
              >
                Use This Title
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
