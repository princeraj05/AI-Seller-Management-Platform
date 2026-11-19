import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Save,
  RefreshCw,
  AlertCircle,
  Upload,
  Trash2,
  Star,
  Plus,
  CheckCircle2,
  MoveLeft,
  MoveRight,
  Image as ImageIcon,
} from 'lucide-react';
import { getProductByIdApi, updateProductApi, uploadProductImageApi } from '../../services/productService';
import { isLocalDevImage } from '../../utils/imageUrl';
import ProductImage from '../../components/common/ProductImage';

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

  // Images state
  const [images, setImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [imageError, setImageError] = useState(null);
  const fileInputRef = useRef(null);

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

        const rawImgs = Array.isArray(item.images) ? item.images : [];
        setImages(
          rawImgs.map((img, i) => {
            // Keep the stored value untouched; resolution happens only at render time
            const url = typeof img === 'string' ? img : (img?.secure_url || img?.url || '');
            return {
              id: `existing_${i}_${Date.now()}`,
              url,
              secure_url: url,
              name: `Image ${i + 1}`,
              size: 0,
              isUploading: false,
              error: null,
            };
          })
        );
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

  const uploadSingleImage = async (file, tempId) => {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const uploadRes = await uploadProductImageApi({
        image: base64Data,
        fileName: file.name,
        mimeType: file.type,
      });

      const finalUploadedUrl = uploadRes?.data?.secure_url || uploadRes?.data?.url || uploadRes?.data?.local_url;
      if (uploadRes && uploadRes.success && finalUploadedUrl) {
        setImages((prev) =>
          prev.map((item) =>
            item.id === tempId
              ? {
                  ...item,
                  url: finalUploadedUrl,
                  secure_url: finalUploadedUrl,
                  public_id: uploadRes.data.public_id,
                  isUploading: false,
                  error: null,
                }
              : item
          )
        );
      } else {
        throw new Error(uploadRes?.message || 'Upload failed');
      }
    } catch (err) {
      setImages((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? { ...item, isUploading: false, error: err.message || 'Upload failed' }
            : item
        )
      );
    }
  };

  const handleFiles = (fileList) => {
    setImageError(null);
    const validFiles = [];
    const maxSizeBytes = 10 * 1024 * 1024;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    for (const file of Array.from(fileList)) {
      if (!allowedTypes.includes(file.type)) {
        setImageError(`Unsupported format for "${file.name}". Only JPG, PNG, and WEBP are allowed.`);
        continue;
      }
      if (file.size > maxSizeBytes) {
        setImageError(`File "${file.name}" exceeds the 10MB limit.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    validFiles.forEach((file) => {
      const tempId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const previewUrl = URL.createObjectURL(file);

      const newImgItem = {
        id: tempId,
        url: previewUrl,
        name: file.name,
        size: file.size,
        fileRef: file,
        isUploading: true,
        error: null,
      };

      setImages((prev) => [...prev, newImgItem]);
      uploadSingleImage(file, tempId);
    });
  };

  const handleRemoveImage = (idToRemove) => {
    setImages((prev) => prev.filter((img) => img.id !== idToRemove));
  };

  const handleSetMainImage = (index) => {
    if (index === 0) return;
    setImages((prev) => {
      const next = [...prev];
      const [target] = next.splice(index, 1);
      next.unshift(target);
      return next;
    });
  };

  const handleMoveImage = (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= images.length) return;
    setImages((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
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

    if (images.some((img) => img.isUploading)) {
      setSaveError('Please wait for image uploads to complete before saving.');
      return;
    }

    setIsSaving(true);
    try {
      // Only persisted URLs (existing records + successful uploads); never blob previews
      const finalImageUrls = images
        .filter((img) => !img.error && img.secure_url)
        .map((img) => img.secure_url);

      const updateData = {
        title: name.trim(),
        description: description.trim(),
        masterPrice: Number(price),
        stock: Number(stock) || 0,
        images: finalImageUrls,
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

          {/* Product Images Management */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Product Images</h3>
                <p className="text-[11px] text-slate-500">The first image is the primary thumbnail across all channels.</p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Upload Image
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />

            {imageError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center justify-between">
                <span>{imageError}</span>
                <button type="button" onClick={() => setImageError(null)} className="text-rose-500 font-bold">×</button>
              </div>
            )}

            {images.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {images.map((img, idx) => {
                  const isMain = idx === 0;
                  return (
                    <div
                      key={img.id}
                      className={`relative rounded-xl border p-2 bg-white flex flex-col justify-between ${
                        isMain ? 'ring-2 ring-blue-500/50 border-blue-400' : 'border-slate-200'
                      }`}
                    >
                      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-slate-50 border border-slate-100 mb-2 flex items-center justify-center">
                        {img.isUploading ? (
                          <div className="text-center p-2">
                            <RefreshCw className="w-5 h-5 animate-spin text-blue-500 mx-auto mb-1" />
                            <span className="text-[10px] text-slate-500">Uploading...</span>
                          </div>
                        ) : img.error ? (
                          <div className="text-center p-2 text-rose-600">
                            <AlertCircle className="w-5 h-5 mx-auto mb-1" />
                            <span className="text-[10px] font-semibold block leading-tight">Upload failed</span>
                            <span className="text-[9px] block leading-tight mt-0.5">{img.error}</span>
                          </div>
                        ) : (
                          <ProductImage src={img.url} alt={img.name} fit="contain" className="w-full h-full" />
                        )}

                        {!img.isUploading && !img.error && isLocalDevImage(img.secure_url) && (
                          <span
                            className="absolute bottom-1 left-1 bg-amber-500 text-white font-bold text-[8px] px-1 py-0.5 rounded"
                            title="Stored on local development disk. Migrate to Cloudinary before production."
                          >
                            Local dev
                          </span>
                        )}

                        {isMain && (
                          <span className="absolute top-1 left-1 bg-blue-600 text-white font-bold text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Star className="w-2.5 h-2.5 fill-current" /> Main
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px]">
                        {!isMain ? (
                          <button
                            type="button"
                            onClick={() => handleSetMainImage(idx)}
                            className="text-blue-600 font-semibold"
                          >
                            Set Main
                          </button>
                        ) : (
                          <span className="text-slate-400 font-semibold">Primary</span>
                        )}

                        <div className="flex items-center gap-1">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleMoveImage(idx, -1)}
                              className="p-1 text-slate-400 hover:text-slate-600"
                              title="Move Left"
                            >
                              <MoveLeft className="w-3 h-3" />
                            </button>
                          )}
                          {idx < images.length - 1 && (
                            <button
                              type="button"
                              onClick={() => handleMoveImage(idx, 1)}
                              className="p-1 text-slate-400 hover:text-slate-600"
                              title="Move Right"
                            >
                              <MoveRight className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(img.id)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
                No product images attached. Click "Upload Image" above to add photos.
              </div>
            )}
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
