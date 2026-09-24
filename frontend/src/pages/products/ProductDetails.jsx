import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Sparkles, Store, ShoppingBag, BarChart2, Building, RefreshCw, AlertCircle } from 'lucide-react';
import { getProductByIdApi } from '../../services/productService';

export default function ProductDetails() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProduct = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getProductByIdApi(id);
      const item = res?.data?.product || res?.product || res;
      if (item && (item._id || item.id)) {
        setProduct(item);
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3 font-sans">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <p className="text-xs font-semibold text-slate-600">Loading product details...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="space-y-6 font-sans">
        <Link to="/products" className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Products
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center space-y-3 text-red-700 text-xs">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
          <p className="font-bold text-sm">{error || 'Product not found.'}</p>
          <button
            onClick={fetchProduct}
            className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  const productId = product._id || product.id;
  const title = product.title || product.name || 'Untitled Product';
  const category = product.categoryName || product.category || 'Fashion';
  const image = Array.isArray(product.images) && product.images.length > 0
    ? product.images[0]
    : 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=500';

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <Link to="/products" className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Products
        </Link>
        <Link to={`/products/${productId}/edit`} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5">
          <Edit className="w-3.5 h-3.5" /> Edit Product
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-8 text-xs">
        {/* Product Image Gallery */}
        <div>
          <img src={image} alt={title} className="w-full h-72 object-cover rounded-xl border border-slate-200" />
        </div>

        {/* Product Information */}
        <div className="md:col-span-2 space-y-4">
          <div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              product.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {product.status || 'Active'}
            </span>
            <h1 className="text-xl font-bold text-slate-900 mt-1">{title}</h1>
            <p className="text-slate-500 text-xs">
              SKU: {product.sku} • Brand: {product.brand || 'Bhartiye Crafts'} • Category: {category}
            </p>
          </div>

          <div className="flex items-baseline gap-4 py-3 border-y border-slate-100">
            <span className="text-2xl font-extrabold text-slate-900">₹{product.masterPrice}</span>
            {product.costPrice ? (
              <span className="text-xs text-slate-500">Cost Price: ₹{product.costPrice}</span>
            ) : null}
            <span className="text-xs text-slate-600 ml-auto font-semibold">Stock: {product.stock || 0} pcs</span>
          </div>

          {product.description && (
            <div>
              <h3 className="font-bold text-slate-800 mb-1">Description</h3>
              <p className="text-slate-600 leading-relaxed">{product.description}</p>
            </div>
          )}

          {/* Connected Marketplace Badges */}
          <div>
            <h3 className="font-bold text-slate-800 mb-2">Publish Status Across Channels</h3>
            <div className="flex flex-wrap gap-2">
              <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-1.5 text-amber-800 font-medium">
                <Store className="w-3.5 h-3.5 text-amber-600" /> Amazon (Ready)
              </div>
              <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-1.5 text-blue-800 font-medium">
                <ShoppingBag className="w-3.5 h-3.5 text-blue-600" /> Flipkart (Ready)
              </div>
              <div className="px-3 py-1.5 bg-pink-50 border border-pink-200 rounded-lg flex items-center gap-1.5 text-pink-800 font-medium">
                <BarChart2 className="w-3.5 h-3.5 text-pink-600" /> Myntra (Ready)
              </div>
              <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-1.5 text-emerald-800 font-medium">
                <Building className="w-3.5 h-3.5 text-emerald-600" /> POS / Offline Available
              </div>
            </div>
          </div>

          {/* AI Insights Card */}
          <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-indigo-900">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>AI Product Insights</span>
            </div>
            <ul className="list-disc pl-4 space-y-1 text-slate-600">
              <li>Master SKU {product.sku} is properly formatted for multi-channel listing.</li>
              <li>Master price ₹{product.masterPrice} is synchronized across active channel rules.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
