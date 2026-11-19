import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Upload,
  CheckCircle2,
  Image as ImageIcon,
  AlertCircle,
  RefreshCw,
  Trash2,
  Star,
  MoveLeft,
  MoveRight,
  Plus,
  X,
} from 'lucide-react';
import { createProductApi, uploadProductImageApi } from '../../services/productService';
import { getCategoriesApi } from '../../services/categoryService';
import { generateProductAIApi } from '../../services/aiService';
import ProductImage from '../../components/common/ProductImage';

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

  // Images State
  const [images, setImages] = useState([]); // [{ id, url, secure_url, public_id, name, size, isUploading, error }]
  const [isDragging, setIsDragging] = useState(false);
  const [imageError, setImageError] = useState(null);
  const fileInputRef = useRef(null);

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

  // Upload a single file item to backend/Cloudinary
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
                  provider: uploadRes.data.provider,
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
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
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
      // Check for duplicate
      if (images.some((img) => img.name === file.name && img.size === file.size)) {
        setImageError(`"${file.name}" has already been selected.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Enqueue items
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

  const handleRetryUpload = (img) => {
    if (!img.fileRef) return;
    setImages((prev) =>
      prev.map((item) => (item.id === img.id ? { ...item, isUploading: true, error: null } : item))
    );
    uploadSingleImage(img.fileRef, img.id);
  };

  const handleRemoveImage = (id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
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

    // Check if any images are still actively uploading
    if (images.some((img) => img.isUploading)) {
      setErrorMsg('Please wait for image uploads to complete before publishing.');
      setStep(2);
      return;
    }

    setIsSubmitting(true);
    try {
      // Only persisted storage URLs (never blob previews, never stock placeholders)
      const uploadedImageUrls = images
        .filter((img) => !img.error && img.secure_url)
        .map((img) => img.secure_url);

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
        images: uploadedImageUrls,
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
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-bold text-sm text-slate-900">Product Images</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Upload product images. The first image will be used as the main product image.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {images.length} {images.length === 1 ? 'image' : 'images'} added
              </span>
            </div>

            {imageError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{imageError}</span>
                </div>
                <button type="button" onClick={() => setImageError(null)} className="text-rose-400 hover:text-rose-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Drag & Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files) {
                  handleFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/50 shadow-inner'
                  : 'border-slate-300 hover:border-blue-400 bg-slate-50/70 hover:bg-slate-50'
              }`}
            >
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
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <p className="font-bold text-xs text-slate-800">
                Drag and drop your images here, or <span className="text-blue-600 underline">browse files</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports JPG, PNG, and WEBP. Maximum file size: 10MB per image.
              </p>
            </div>

            {/* Images Grid */}
            {images.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Selected Images & Upload Status</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 text-[11px]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add More Images
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {images.map((img, idx) => {
                    const isMain = idx === 0;
                    return (
                      <div
                        key={img.id}
                        className={`relative rounded-xl border p-2.5 bg-white transition-shadow shadow-xs flex flex-col justify-between ${
                          isMain ? 'ring-2 ring-blue-500/40 border-blue-400' : 'border-slate-200'
                        }`}
                      >
                        <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-slate-100 border border-slate-100 mb-2 flex items-center justify-center">
                          {img.isUploading ? (
                            <div className="flex flex-col items-center justify-center p-2 text-center text-slate-500">
                              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-1" />
                              <span className="text-[10px] font-semibold">Uploading...</span>
                            </div>
                          ) : img.error ? (
                            <div className="flex flex-col items-center justify-center p-2 text-center text-rose-500">
                              <AlertCircle className="w-6 h-6 mb-1 text-rose-500" />
                              <span className="text-[10px] font-semibold text-rose-600 leading-tight">Upload Failed</span>
                              <button
                                type="button"
                                onClick={() => handleRetryUpload(img)}
                                className="mt-1.5 text-[10px] bg-rose-100 hover:bg-rose-200 text-rose-800 px-2 py-0.5 rounded font-bold"
                              >
                                Retry
                              </button>
                            </div>
                          ) : (
                            <ProductImage
                              src={img.url}
                              alt={img.name}
                              fit="contain"
                              className="w-full h-full"
                            />
                          )}

                          {isMain && (
                            <div className="absolute top-1.5 left-1.5 bg-blue-600 text-white font-bold text-[9px] uppercase px-2 py-0.5 rounded shadow-xs flex items-center gap-1">
                              <Star className="w-2.5 h-2.5 fill-current" /> Main Image
                            </div>
                          )}

                          {img.secure_url && (
                            <div className="absolute top-1.5 right-1.5 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-xs flex items-center gap-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </div>

                        {/* File Details */}
                        <div className="min-w-0 mb-2">
                          <p className="text-[11px] font-semibold text-slate-800 truncate" title={img.name}>
                            {img.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {(img.size / 1024).toFixed(1)} KB
                            {img.secure_url && (
                              <span className="text-emerald-600 font-semibold ml-1">
                                • {img.provider === 'CLOUDINARY' ? 'Cloudinary' : 'Local dev storage'}
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[10px]">
                          {!isMain ? (
                            <button
                              type="button"
                              onClick={() => handleSetMainImage(idx)}
                              className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                            >
                              <Star className="w-3 h-3" /> Set Main
                            </button>
                          ) : (
                            <span className="text-slate-400 font-semibold italic">Primary Image</span>
                          )}

                          <div className="flex items-center gap-1 ml-auto">
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={() => handleMoveImage(idx, -1)}
                                title="Move Left"
                                className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
                              >
                                <MoveLeft className="w-3 h-3" />
                              </button>
                            )}
                            {idx < images.length - 1 && (
                              <button
                                type="button"
                                onClick={() => handleMoveImage(idx, 1)}
                                title="Move Right"
                                className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
                              >
                                <MoveRight className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(img.id)}
                              title="Delete Image"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-[11px] flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-slate-400" />
                <span>No images uploaded yet. The product will be saved without images (shown as "No image").</span>
              </div>
            )}
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
            {images.length > 0 && (images[0].secure_url || images[0].url) && (
              <div className="inline-flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-left">
                <ProductImage
                  src={images[0].secure_url || images[0].url}
                  alt="Main Product"
                  fit="contain"
                  className="w-14 h-14 rounded-lg border border-slate-200 bg-white shrink-0"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 block">Primary Product Image Attached</span>
                  <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {images.length} {images.length === 1 ? 'image' : 'images'} uploaded
                  </span>
                </div>
              </div>
            )}
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
