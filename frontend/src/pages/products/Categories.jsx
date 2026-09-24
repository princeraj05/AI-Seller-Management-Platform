import React, { useState, useEffect } from 'react';
import { Plus, Folder, ChevronRight, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getCategoriesApi, createCategoryApi } from '../../services/categoryService';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  const fetchCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCategoriesApi();
      const list = res?.data?.categories || res?.categories || (Array.isArray(res) ? res : []);
      setCategories(list);
    } catch (err) {
      setError(err.message || 'Failed to load categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    setModalError(null);
    if (!newCatName.trim()) {
      setModalError('Category name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createCategoryApi({
        name: newCatName.trim(),
        description: newCatDesc.trim(),
      });
      const created = res?.data?.category || res?.category || res;
      if (created) {
        setCategories((prev) => [...prev, created]);
        setShowAddModal(false);
        setNewCatName('');
        setNewCatDesc('');
      }
    } catch (err) {
      setModalError(err.message || 'Failed to create category.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Product Categories</h1>
          <p className="text-xs text-slate-500">Organize your master products with categories and map marketplace attributes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCategories}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
            title="Refresh Categories"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>
      </div>

      {/* Add Category Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-md space-y-4 text-xs shadow-xl">
            <h2 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
              Create New Category
            </h2>
            {modalError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}
            <form onSubmit={handleCreateCategory} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Category Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Handicrafts"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Brief description of the category..."
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
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
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save Category'}
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
          <p className="text-xs font-semibold text-slate-600">Loading categories...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center space-y-3 text-red-700 text-xs">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
          <p className="font-bold">{error}</p>
          <button
            onClick={fetchCategories}
            className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700"
          >
            Retry Loading Categories
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
          {/* Category Tree Box */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h2 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
              Active Category Hierarchy ({categories.length})
            </h2>
            <div className="space-y-2 max-h-[450px] overflow-y-auto">
              {categories.map((cat) => (
                <div key={cat._id || cat.slug || cat.name} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-blue-600" /> {cat.name}
                    </span>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                      {cat.isGlobal ? 'Global' : 'Custom'}
                    </span>
                  </div>
                  {cat.description && (
                    <p className="pl-6 text-[11px] text-slate-500">{cat.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Attribute Mapping Config */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
              Category Details & Attribute Mapping
            </h2>
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
              <span className="font-bold text-xs text-blue-900">Required E-Commerce Category Rules</span>
              <p className="text-[11px] text-slate-600">
                Attributes required for Amazon SP-API, Flipkart & Myntra channel publishing: Category, Gender, Fabric, Fit, Pattern, Neck Type, Sleeve Length.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 border border-slate-200 rounded-lg">
                <span className="font-bold text-slate-800 block">Fabric</span>
                <span className="text-[11px] text-slate-400">Cotton, Silk, Rayon, Georgette</span>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg">
                <span className="font-bold text-slate-800 block">Fit Type</span>
                <span className="text-[11px] text-slate-400">Regular, Slim, Anarkali, Straight</span>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg">
                <span className="font-bold text-slate-800 block">Sleeve Length</span>
                <span className="text-[11px] text-slate-400">3/4th Sleeve, Full Sleeve, Sleeveless</span>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg">
                <span className="font-bold text-slate-800 block">Occasion</span>
                <span className="text-[11px] text-slate-400">Casual, Festive, Party, Office</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
