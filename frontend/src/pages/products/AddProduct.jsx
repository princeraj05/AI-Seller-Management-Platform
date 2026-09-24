import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, ArrowLeft, Upload, CheckCircle2, Image as ImageIcon, AlertCircle, RefreshCw } from 'lucide-react';
import { createProductApi } from '../../services/productService';
import { getCategoriesApi } from '../../services/categoryService';
import { generateProductAIApi } from '../../services/aiService';

export default function AddProduct() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [brand, setBrand] = useState('Bhartiye Crafts');
  const [categoryName, setCategoryName] = useState('Fashion');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('0');
  const [stock, setStock] = useState('0');
  const [categories, setCategories] = useState([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [aiSuccessMsg, setAiSuccessMsg] = useState(null);

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await getCategoriesApi();
        const list = res?.data?.categories || res?.categories || (Array.isArray(res) ? res : []);
        setCategories(list);
        if (list.length > 0 && !categoryName) {
          setCategoryName(list[0].name);
        }
      } catch (err) {
        console.warn('Failed to load categories:', err.message);
      }
    };
    fetchCats();
  }, []);

  const handleAiGenerate = async () => {
    setErrorMsg(null);
    setAiSuccessMsg(null);
    const hint = productName.trim() || 'Handcrafted Cotton Kurta';
    setIsAiGenerating(true);
    try {
      const res = await generateProductAIApi({
        prompt: hint,
        category: categoryName,
        brand: brand,
      });
      const draft = res?.data?.draft || res?.draft || res;
      if (draft) {
        if (draft.title) setProductName(draft.title);
        if (draft.description) setDescription(draft.description);
        if (draft.brand) setBrand(draft.brand);
        if (draft.category) setCategoryName(draft.category);
        if (!sku) setSku(`SKU-AI-${Date.now().toString().slice(-4)}`);
        setAiSuccessMsg('AI generated title, description & attributes successfully!');
      }
    } catch (err) {
      setErrorMsg(err.message || 'AI generation failed.');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handlePublish = async () => {
    setErrorMsg(null);

    // Validation
    if (!productName.trim()) {
      setErrorMsg('Product Name is required.');
      setStep(1);
      return;
    }
    if (!sku.trim()) {
      setErrorMsg('SKU is required.');
      setStep(1);
      return;
    }
    if (price === '' || isNaN(Number(price)) || Number(price) < 0) {
      setErrorMsg('Valid master price (>= 0) is required.');
      setStep(3);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: productName.trim(),
        sku: sku.trim().toUpperCase(),
        brand: brand.trim() || 'Bhartiye Crafts',
        categoryName: categoryName || 'Fashion',
        description: description.trim(),
        shortDescription: description.trim().slice(0, 150),
        masterPrice: Number(price),
        costPrice: Number(cost) || 0,
        stock: Number(stock) || 0,
        images: [
          'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=500'
        ]
      };

      const res = await createProductApi(payload);
      if (res && (res.success || res.product || res.data)) {
        navigate('/products');
      } else {
        setErrorMsg('Failed to create product. Please try again.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'An error occurred while creating product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans">
      <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Add Product</h1>
          <p className="text-xs text-slate-500">
            Create a new master product and publish to multiple sales channels.
          </p>
        </div>
        <button
          onClick={() => navigate('/products')}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Cancel
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-4 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {aiSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-4 rounded-xl flex items-center gap-2 font-medium">
          <Sparkles className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{aiSuccessMsg}</span>
        </div>
      )}

      {/* Step Indicator Bar */}
      <div className="grid grid-cols-6 gap-2 bg-white p-3 rounded-xl border border-slate-200 text-[11px] font-semibold text-slate-500 text-center">
        {['1. Basic Info', '2. Images', '3. Pricing & Stock', '4. Attributes', '5. Variants', '6. Review'].map((stName, idx) => (
          <div
            key={stName}
            onClick={() => setStep(idx + 1)}
            className={`py-1.5 rounded-lg cursor-pointer transition-colors ${
              step === idx + 1 ? 'bg-blue-600 text-white font-bold' : 'bg-slate-50 hover:bg-slate-100'
            }`}
          >
            {stName}
          </div>
        ))}
      </div>

      {/* Step Content Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 text-xs">
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-bold text-sm text-slate-900">Basic Information</h2>
              <button
                type="button"
                onClick={handleAiGenerate}
                disabled={isAiGenerating}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAiGenerating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>Generate with AI</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Product Name / Hint *</label>
                <input
                  type="text"
                  placeholder="e.g. Handcrafted Cotton Kurta"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">SKU *</label>
                <input
                  type="text"
                  placeholder="e.g. KUR-001"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Brand *</label>
                <input
                  type="text"
                  placeholder="Bhartiye Crafts"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Category *</label>
                <select
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="Fashion">Fashion</option>
                  {categories.map((c) => (
                    <option key={c._id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Description</label>
              <textarea
                rows={4}
                placeholder="Product description and details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3">Product Images</h2>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 space-y-2">
              <Upload className="w-8 h-8 text-blue-500 mx-auto" />
              <p className="font-semibold text-slate-700">Standard Product Placeholder Active</p>
              <p className="text-[11px] text-slate-400">Default product image will be attached upon publication.</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3">Pricing & Inventory</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cost Price (₹)</label>
                <input
                  type="number"
                  placeholder="250"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Master Price (₹) *</label>
                <input
                  type="number"
                  placeholder="699"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Initial Stock *</label>
                <input
                  type="number"
                  placeholder="50"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {step >= 4 && (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="font-bold text-base text-slate-900">Product Specification Verified</h2>
            <p className="text-xs text-slate-500">
              Review details: <strong>{productName || 'New Product'}</strong> ({sku || 'NO-SKU'}) — ₹{price || '0'}
            </p>
          </div>
        )}

        {/* Wizard Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1 || isSubmitting}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          {step < 6 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-1"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                'Publish Product'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
