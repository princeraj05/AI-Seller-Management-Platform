import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Plus, Search, Filter, Eye, Edit, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import { getProductsApi, deleteProductApi } from '../../services/productService';
import { getCategoriesApi } from '../../services/categoryService';

export default function ProductCatalog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchCategories = async () => {
    try {
      const res = await getCategoriesApi();
      const list = res?.data?.categories || res?.categories || (Array.isArray(res) ? res : []);
      setCategories(list);
    } catch (err) {
      console.warn('Failed to load categories:', err.message);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (searchTerm) params.search = searchTerm;
      if (selectedCategory && selectedCategory !== 'All') params.category = selectedCategory;

      const res = await getProductsApi(params);
      const items = res?.data?.products || res?.products || [];
      setProducts(items);
    } catch (err) {
      setError(err.message || 'Failed to load products from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchProducts();
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title || 'this product'}"?`)) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteProductApi(id);
      setProducts((prev) => prev.filter((p) => (p._id || p.id) !== id));
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            All Products ({products.length})
          </h1>
          <p className="text-xs text-slate-500">
            Create, manage and publish your master product catalog across multiple channels.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchProducts}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
            title="Refresh Catalog"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/products/new"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <form
        onSubmit={handleSearchSubmit}
        className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 text-xs"
      >
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search products by SKU or Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            type="submit"
            className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg font-semibold"
          >
            Search
          </button>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none"
          >
            <option value="All">All Categories</option>
            {categories.map((c) => (
              <option key={c._id || c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-slate-500">
          <span>Showing {products.length} items</span>
        </div>
      </form>

      {/* Loading & Error States */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-600">Loading master product catalog...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center space-y-3 text-red-700 text-xs">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
          <p className="font-bold">{error}</p>
          <button
            onClick={fetchProducts}
            className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700"
          >
            Retry Loading Products
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <Package className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 text-sm">No products found</h3>
          <p className="text-xs text-slate-500">Add your first product to get started.</p>
          <Link
            to="/products/new"
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white font-semibold text-xs px-4 py-2 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Add New Product
          </Link>
        </div>
      ) : (
        /* Products Table */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-semibold">
              <tr>
                <th className="p-4">Product</th>
                <th className="p-4">SKU</th>
                <th className="p-4">Category</th>
                <th className="p-4">Master Price</th>
                <th className="p-4">Stock</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((product) => {
                const id = product._id || product.id;
                const title = product.title || product.name;
                const category = product.categoryName || product.category || 'Fashion';
                const image = Array.isArray(product.images) && product.images.length > 0
                  ? product.images[0]
                  : 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=150';

                return (
                  <tr key={id} className="hover:bg-slate-50">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={image}
                          alt={title}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                        />
                        <div>
                          <span className="font-bold text-slate-900 block">{title}</span>
                          <span className="text-[11px] text-slate-400">{product.brand || 'Bhartiye Crafts'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-mono font-medium text-slate-700">{product.sku}</td>
                    <td className="p-4 text-slate-600">{category}</td>
                    <td className="p-4 font-bold text-slate-900">₹{product.masterPrice}</td>
                    <td className="p-4 font-semibold text-slate-800">{product.stock || 0} pcs</td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          product.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {product.status || 'Active'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/products/${id}`}
                          className="p-1.5 text-slate-400 hover:text-blue-600 rounded"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          to={`/products/${id}/edit`}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded"
                          title="Edit Product"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(id, title)}
                          disabled={deletingId === id}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded disabled:opacity-50"
                          title="Delete Product"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
