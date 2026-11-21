import React, { useState, useEffect } from 'react';
import {
  Package,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Eye,
  FileCode,
  ShieldAlert,
  ShieldCheck,
  Send,
  Save,
  Tag,
  DollarSign,
  Layers,
  Image as ImageIcon,
  ImageOff,
  Info,
  ExternalLink,
  ChevronRight,
  X,
  Plus,
  Trash2,
  ListFilter,
  Sparkles,
} from 'lucide-react';
import {
  getAmazonEligibleProductsApi,
  getAmazonProductTypesApi,
  getAmazonProductTypeSchemaApi,
  validateAmazonListingApi,
  createAmazonListingSubmissionApi,
  submitAmazonListingApi,
  getAmazonListingSubmissionsApi,
  getAmazonListingSubmissionByIdApi,
} from '../../services/channelService';
import { resolveProductImageUrl } from '../../utils/imageUrl';
import { useSearchParams } from 'react-router-dom';
import { getProductByIdApi } from '../../services/productService';

function ProductThumbnail({ src, alt, className = '', iconClassName = 'w-6 h-6 text-slate-400' }) {
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(Boolean(src));

  useEffect(() => {
    setHasError(false);
    setLoading(Boolean(src));
  }, [src]);

  if (!src || hasError) {
    return (
      <div className={`bg-slate-100 flex items-center justify-center text-slate-400 ${className}`}>
        <Package className={iconClassName} />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-slate-50 flex items-center justify-center ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-300" />
        </div>
      )}
      <img
        src={resolveProductImageUrl(src)}
        alt={alt || 'Product'}
        onLoad={() => setLoading(false)}
        onError={() => {
          setHasError(true);
          setLoading(false);
        }}
        className={`w-full h-full object-cover transition-opacity duration-200 ${loading ? 'opacity-0' : 'opacity-100'}`}
      />
    </div>
  );
}

export default function AmazonListingPublisher({ connection, onListingCreated, initialProductId }) {
  const [searchParams] = useSearchParams();
  const targetProductId = (initialProductId || searchParams.get('productId') || '').trim();
  const [subView, setSubView] = useState('wizard'); // 'wizard' | 'history'
  const [wizardStep, setWizardStep] = useState(1); // 1 to 7

  // Products selection
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Product types
  const [productTypes, setProductTypes] = useState([]);
  const [productTypesLoading, setProductTypesLoading] = useState(false);
  const [selectedProductType, setSelectedProductType] = useState('');
  const [schemaData, setSchemaData] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Listing Form Data
  const [formData, setFormData] = useState({
    title: '',
    brand: '',
    sellerSku: '',
    description: '',
    bulletPoints: ['', '', ''],
    mainImage: '',
    otherImages: [],
    price: '',
    quantity: '',
    fulfillmentChannel: 'DEFAULT',
    externalProductId: '',
    externalProductIdType: 'EAN',
    gtinExemptionRequested: false,
    countryOfOrigin: 'IN',
    categoryAttributes: {
      color: '',
      size: '',
      material: '',
      targetGender: '',
      department: '',
    },
  });

  // Validation & Submission States
  const [validationResult, setValidationResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionRecord, setSubmissionRecord] = useState(null);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [showJsonPayload, setShowJsonPayload] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Image Verification States
  const [mainImageState, setMainImageState] = useState('idle'); // 'idle' | 'checking' | 'valid' | 'broken'
  const [mainImageError, setMainImageError] = useState(null);

  // Auto-verify main image accessibility when URL changes
  useEffect(() => {
    if (!formData.mainImage || !formData.mainImage.trim()) {
      setMainImageState('idle');
      setMainImageError(null);
      return;
    }
    const trimmed = formData.mainImage.trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('blob:') || lower.startsWith('data:') || lower.startsWith('file:') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
      setMainImageState('broken');
      setMainImageError('Amazon rejects blob:, data:, and local filesystem paths. Images must be public HTTPS URLs.');
      return;
    }
    if (lower.startsWith('http://')) {
      setMainImageState('broken');
      setMainImageError('Amazon requires secure HTTPS image links. Insecure HTTP is rejected.');
      return;
    }
    const isDevAsset = trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/');
    if (!trimmed.startsWith('https://') && !isDevAsset) {
      setMainImageState('broken');
      setMainImageError('Amazon requires secure HTTPS image links (e.g. Cloudinary or S3) or local upload assets.');
      return;
    }
    setMainImageState('checking');
    setMainImageError(null);
    const imgTester = new Image();
    imgTester.onload = () => {
      setMainImageState('valid');
      setMainImageError(null);
    };
    imgTester.onerror = () => {
      setMainImageState('broken');
      setMainImageError('Image failed to load in browser. The URL may be inaccessible, hotlink-protected, or returning a 404/403 error.');
    };
    imgTester.src = resolveProductImageUrl(trimmed);
  }, [formData.mainImage]);

  // History State
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  // Load eligible products when wizard begins
  useEffect(() => {
    fetchProducts();
    fetchProductTypes();
    fetchHistory();
  }, []);

  // When selectedProductType changes, fetch schema
  useEffect(() => {
    if (selectedProductType) {
      fetchSchema(selectedProductType);
    }
  }, [selectedProductType]);

  const fetchProducts = async (query = '') => {
    try {
      setProductsLoading(true);
      setErrorMessage(null);
      const res = await getAmazonEligibleProductsApi({ q: query, search: query, limit: 12 });
      let productList = [];
      if (res && res.success) {
        if (Array.isArray(res.data)) {
          productList = res.data;
        } else if (Array.isArray(res.products)) {
          productList = res.products;
        } else if (Array.isArray(res.data?.products)) {
          productList = res.data.products;
        }
      } else if (Array.isArray(res)) {
        productList = res;
      }
      setProducts(Array.isArray(productList) ? productList : []);
    } catch (err) {
      setProducts([]);
      setErrorMessage(err.message || 'Failed to load central catalogue products');
    } finally {
      setProductsLoading(false);
    }
  };

  const fetchProductTypes = async () => {
    try {
      setProductTypesLoading(true);
      const res = await getAmazonProductTypesApi();
      let list = [];
      if (Array.isArray(res?.data?.productTypes)) {
        list = res.data.productTypes;
      } else if (Array.isArray(res?.productTypes)) {
        list = res.productTypes;
      } else if (Array.isArray(res?.data)) {
        list = res.data;
      } else if (Array.isArray(res)) {
        list = res;
      }
      setProductTypes(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('Error fetching product types:', err);
      setProductTypes([]);
    } finally {
      setProductTypesLoading(false);
    }
  };

  const fetchSchema = async (type) => {
    try {
      setSchemaLoading(true);
      const res = await getAmazonProductTypeSchemaApi(type);
      if (res && (res.success || res.productType)) {
        setSchemaData(res.data || res);
      }
    } catch (err) {
      console.warn('Error fetching schema:', err);
    } finally {
      setSchemaLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await getAmazonListingSubmissionsApi({ limit: 50 });
      let list = [];
      if (Array.isArray(res?.data)) {
        list = res.data;
      } else if (Array.isArray(res?.submissions)) {
        list = res.submissions;
      } else if (Array.isArray(res?.data?.submissions)) {
        list = res.data.submissions;
      } else if (Array.isArray(res)) {
        list = res;
      }
      setHistoryList(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('Error fetching history:', err);
      setHistoryList([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Handler for selecting a product
  const handleSelectProduct = (prod) => {
    if (!prod) return;
    setSelectedProduct(prod);
    setErrorMessage(null);

    const prodTitle = prod.title || prod.name || 'Demo Product';
    const prodBrand = prod.brand || 'Demo Brand';
    const prodCategory = prod.categoryName || prod.category || '';
    const prodSku = prod.sku || '';

    // Auto-map attributes from central product
    const imgList = Array.isArray(prod.images) ? prod.images : [];
    // Keep stored URLs as-is for the Amazon payload; resolution is only for display
    const mainImg = typeof imgList[0] === 'string' ? imgList[0] : (imgList[0]?.secure_url || imgList[0]?.url || '');
    const otherImgs = imgList.slice(1).map((img) => (typeof img === 'string' ? img : img?.secure_url || img?.url)).filter(Boolean);

    // Product Type: prioritize master product definition; never default to SHIRT
    const existingType = (prod.productType || '').trim().toUpperCase();
    setSelectedProductType(existingType);

    // Bullet points: prioritize master product bulletPoints
    const existingBullets = Array.isArray(prod.bulletPoints) && prod.bulletPoints.filter(Boolean).length > 0
      ? prod.bulletPoints.filter(Boolean)
      : [
          `Premium quality ${prodTitle} crafted with care`,
          `Authentic ${prodBrand} product designed for durability`,
          `High quality finish and material`,
        ];

    // Attributes map / object resolution
    const attrObj = prod.attributes && typeof prod.attributes === 'object' ? prod.attributes : {};

    setFormData({
      title: prodTitle,
      brand: prodBrand,
      sellerSku: prodSku ? `AMZ-${prodSku}` : `AMZ-${Date.now()}`,
      description: prod.description || `High quality ${prodTitle}`,
      bulletPoints: existingBullets,
      mainImage: mainImg,
      otherImages: otherImgs,
      price: prod.masterPrice ? String(prod.masterPrice) : (prod.price ? String(prod.price) : '800'),
      quantity: prod.stock ? String(prod.stock) : '10',
      fulfillmentChannel: 'DEFAULT',
      externalProductId: prod.barcode || '',
      externalProductIdType: prod.barcode ? 'EAN' : '',
      gtinExemptionRequested: !prod.barcode,
      countryOfOrigin: attrObj.countryOfOrigin || attrObj.country_of_origin || 'IN',
      categoryAttributes: {
        color: attrObj.color || prod.color || '',
        size: attrObj.size || prod.size || '',
        material: attrObj.material || prod.material || '',
        targetGender: attrObj.targetGender || attrObj.gender || '',
        department: attrObj.department || '',
      },
    });

    setWizardStep(2);
  };

  // Auto-select targeted product from direct navigation, page refresh, or URL searchParams
  useEffect(() => {
    if (!targetProductId) return;

    let isMounted = true;

    const selectTargetProduct = async () => {
      try {
        setProductsLoading(true);
        // 1. Check if already present in products list
        const found = products.find(
          (p) => String(p._id || p.id) === String(targetProductId)
        );
        if (found) {
          if (isMounted) handleSelectProduct(found);
          return;
        }

        // 2. Fetch directly by ID (handles deep link, refresh, and non-paginated items)
        const res = await getProductByIdApi(targetProductId);
        const prod = res?.data?.product || res?.product || res?.data || res;
        if (prod && (prod._id || prod.id)) {
          if (isMounted) {
            setProducts((prev) => {
              const exists = prev.some((p) => String(p._id || p.id) === String(targetProductId));
              return exists ? prev : [prod, ...prev];
            });
            handleSelectProduct(prod);
          }
        } else {
          if (isMounted) {
            setErrorMessage(`Product "${targetProductId}" not found or unavailable for publishing.`);
            setWizardStep(1);
          }
        }
      } catch (err) {
        if (isMounted) {
          console.warn('Could not load targeted product for Amazon publishing:', err.message);
          setErrorMessage(`Unable to load product "${targetProductId}": ${err.message}. Please select a product from the catalogue below.`);
          setWizardStep(1);
        }
      } finally {
        if (isMounted) setProductsLoading(false);
      }
    };

    selectTargetProduct();

    return () => {
      isMounted = false;
    };
  }, [targetProductId, products.length]);

  const handleValidate = async () => {
    try {
      setValidating(true);
      setErrorMessage(null);

      const payload = {
        productId: selectedProduct?._id,
        sellerSku: formData.sellerSku,
        productType: selectedProductType,
        marketplaceId: 'A21TJRUUN4KGV',
        mappedAttributes: formData,
        gtinExemptionRequested: formData.gtinExemptionRequested,
      };

      const res = await validateAmazonListingApi(payload);
      setValidationResult(res);

      if (res.valid) {
        if (mainImageState === 'broken') {
          setSuccessMessage('Listing attributes are valid according to SP-API schema. Notice: Main image could not be loaded in browser — please verify or replace image URL before submission.');
        } else {
          setSuccessMessage('Listing validation passed! All required attributes and image formats comply with Amazon specifications.');
        }
        // Also draft-save the submission safely
        try {
          const saveRes = await createAmazonListingSubmissionApi({
            ...payload,
            status: 'READY',
            submissionMode: 'DRY_RUN',
          });
          const subDoc = saveRes.data?.submission || saveRes.data || saveRes.submission;
          if (subDoc) {
            setSubmissionRecord(subDoc);
          }
        } catch (saveErr) {
          console.warn('Draft save notice:', saveErr);
        }
      } else {
        setErrorMessage('Listing validation found issues that must be corrected before submission.');
      }
      return res.valid;
    } catch (err) {
      setErrorMessage(err.message || 'Validation request failed');
      return false;
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (mode = 'DRY_RUN') => {
    try {
      setSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      setSubmissionResult(null);

      // Save/refresh draft record first
      const draftRes = await createAmazonListingSubmissionApi({
        productId: selectedProduct?._id,
        sellerSku: formData.sellerSku,
        productType: selectedProductType,
        marketplaceId: 'A21TJRUUN4KGV',
        mappedAttributes: formData,
        gtinExemptionRequested: formData.gtinExemptionRequested,
        submissionMode: mode,
        status: 'READY',
      });

      const subDoc = draftRes.data?.submission || draftRes.data || draftRes.submission;
      const submissionId = subDoc?._id || subDoc?.id;

      if (!draftRes.success || !submissionId) {
        throw new Error(draftRes.message || 'Failed to prepare submission record in local database');
      }

      setSubmissionRecord(subDoc);

      // Execute submission
      const execRes = await submitAmazonListingApi(submissionId, {
        submissionMode: mode,
      });

      setSubmissionResult(execRes);
      if (execRes.success) {
        if (mode === 'DRY_RUN' || execRes.data?.isDryRun || execRes.data?.status === 'DRY_RUN_COMPLETED') {
          setSuccessMessage(
            '✅ Local Dry-Run Completed Successfully! The listing payload was verified against SP-API schemas without making external Amazon mutations.'
          );
        } else {
          const amzId = execRes.data?.amazonSubmissionId;
          setSuccessMessage(
            `✅ Amazon Sandbox Submission Sent! HTTP ${execRes.data?.responseMetadata?.httpStatus || 200} received.${amzId ? ` Processing ID: ${amzId}` : ''}`
          );
        }
        fetchHistory();
        if (onListingCreated) onListingCreated();
      } else {
        setErrorMessage(
          execRes.message ||
          (mode === 'DRY_RUN' ? 'Dry-run validation failed' : 'Amazon Sandbox rejected the listing submission')
        );
      }
    } catch (err) {
      setErrorMessage(err.message || 'Error executing submission');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Navigation Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Amazon Product Publishing Studio</h2>
            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Sandbox Only
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Select catalogue products, map schema attributes to Amazon India, validate schemas, and run dry-run / sandbox submissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSubView('wizard'); setWizardStep(1); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
              subView === 'wizard'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> New Listing Wizard
          </button>
          <button
            onClick={() => { setSubView('history'); fetchHistory(); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
              subView === 'history'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" /> Submissions History ({historyList.length})
          </button>
        </div>
      </div>

      {/* Security & Sandbox Guard Notice */}
      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900">
          <p className="font-semibold">Production Publishing Disabled & Catalogue Protection Active</p>
          <p className="text-amber-800/90 text-[11px] mt-0.5">
            Listing operations execute in strict sandbox dry-run mode. Central catalogue stock and master prices are completely immutable and never modified by Amazon listing configurations.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="ml-auto text-rose-500 hover:text-rose-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SUBVIEW 1: NEW LISTING WIZARD */}
      {subView === 'wizard' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Stepper Progress Bar */}
          <div className="border-b border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between max-w-4xl mx-auto overflow-x-auto gap-2">
              {[
                { step: 1, label: '1. Select Product' },
                { step: 2, label: '2. Product Type' },
                { step: 3, label: '3. Attributes' },
                { step: 4, label: '4. Images' },
                { step: 5, label: '5. Offer & Pricing' },
                { step: 6, label: '6. Validation & Preview' },
                { step: 7, label: '7. Submit / Dry-Run' },
              ].map((s) => (
                <button
                  key={s.step}
                  onClick={() => {
                    if (s.step === 1 || selectedProduct) {
                      setWizardStep(s.step);
                    }
                  }}
                  disabled={!selectedProduct && s.step > 1}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    wizardStep === s.step
                      ? 'bg-amber-500 text-white shadow-xs'
                      : wizardStep > s.step
                      ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      : 'text-slate-400 hover:text-slate-600 disabled:opacity-40'
                  }`}
                >
                  {wizardStep > s.step ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <span className="w-3.5 h-3.5 flex items-center justify-center text-[10px] font-bold">
                      {s.step}
                    </span>
                  )}
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* STEP 1: SELECT PRODUCT FROM CATALOGUE */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Select Central Catalogue Product</h3>
                    <p className="text-xs text-slate-500">
                      Choose an existing inventory item from your central master catalogue to list on Amazon India.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by name or SKU..."
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        fetchProducts(e.target.value);
                      }}
                      className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {productsLoading ? (
                  <div className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                    <p className="text-xs">Loading central catalogue products...</p>
                  </div>
                ) : (!Array.isArray(products) || products.length === 0) ? (
                  <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
                    <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-600">No products found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      No products match your search or your catalogue is empty.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(Array.isArray(products) ? products : []).map((prod) => {
                      const rawImg = typeof prod.images?.[0] === 'string'
                        ? prod.images[0]
                        : (prod.images?.[0]?.url || null);
                      const img = rawImg;
                      const isSelected = selectedProduct?._id === prod._id;
                      const prodTitle = prod.title || prod.name || 'Untitled Product';
                      const prodCategory = prod.categoryName || prod.category || '';
                      const prodPrice = prod.masterPrice ?? prod.price ?? 0;
                      const prodStock = prod.stock ?? 0;

                      return (
                        <div
                          key={prod._id}
                          onClick={() => handleSelectProduct(prod)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                            isSelected
                              ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-500/20'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex gap-3">
                            <ProductThumbnail
                              src={img}
                              alt={prodTitle}
                              className="w-16 h-16 rounded-lg border border-slate-200 shrink-0"
                            />

                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-slate-900 truncate" title={prodTitle}>
                                {prodTitle}
                              </h4>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                SKU: <span className="font-mono text-slate-700">{prod.sku}</span>
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs font-extrabold text-slate-900">
                                  ₹{prodPrice}
                                </span>
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                  Stock: {prodStock}
                                </span>
                                {prod.aiApproved && (
                                  <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                    <Sparkles className="w-2.5 h-2.5 text-emerald-600" /> AI Approved
                                  </span>
                                )}
                                {prod.productType && (
                                  <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono truncate max-w-[90px]">
                                    {prod.productType}
                                  </span>
                                )}
                                {prodCategory && (
                                  <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                                    {prodCategory}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">
                              {prod.barcode ? `Barcode: ${prod.barcode}` : 'No GTIN (Exemption needed)'}
                            </span>
                            <span className="text-amber-600 font-semibold flex items-center gap-1">
                              Select <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: SELECT AMAZON PRODUCT TYPE */}
            {wizardStep === 2 && (
              <div className="space-y-5 max-w-2xl mx-auto">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Select Amazon India Product Type</h3>
                  <p className="text-xs text-slate-500">
                    Product types enforce specific attribute requirements and catalog schemas on Amazon.in.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs font-semibold text-slate-700 mb-1">Selected Central Product:</div>
                  <div className="text-xs text-slate-900 font-bold">
                    {selectedProduct?.title || selectedProduct?.name || 'Selected Product'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    SKU: {selectedProduct?.sku} • Category: {selectedProduct?.categoryName || selectedProduct?.category || 'Uncategorized'}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amazon Product Type
                  </label>
                  <select
                    value={selectedProductType}
                    onChange={(e) => setSelectedProductType(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {(Array.isArray(productTypes) ? productTypes : []).map((pt) => (
                      <option key={pt.productType} value={pt.productType}>
                        {pt.displayName || pt.productType} ({pt.productType})
                      </option>
                    ))}
                  </select>
                </div>

                {schemaLoading ? (
                  <div className="p-4 text-center text-slate-400 text-xs">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-amber-500" />
                    Loading schema definition...
                  </div>
                ) : schemaData ? (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Schema Source:</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                          schemaData.schemaSource === 'AMAZON_SP_API'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {schemaData.schemaSource === 'AMAZON_SP_API'
                          ? 'OFFICIAL AMAZON SP-API (v2020-09-01)'
                          : 'DEVELOPMENT_FALLBACK (Local Sandbox)'}
                      </span>
                    </div>

                    {schemaData.schemaSource === 'DEVELOPMENT_FALLBACK' && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 leading-relaxed">
                        <strong>Honest Sandbox Notice:</strong> Amazon SP-API Sandbox does not support dynamic Product Type Definitions for India (Marketplace ID: <code className="font-mono font-bold">A21TJRUUN4KGV</code>). Using high-fidelity local schema definition adhering to Amazon India listings requirements. This is a development validation fallback, not an official Amazon grant.
                      </div>
                    )}

                    <div className="text-slate-600">
                      Requirements Mode: <span className="font-semibold">{schemaData.requirements || 'LISTING'}</span>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      Required fields:{' '}
                      <span className="text-slate-700 font-mono">
                        {(schemaData.requiredAttributes || []).join(', ')}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setWizardStep(1)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Products
                  </button>
                  <button
                    onClick={() => setWizardStep(3)}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"
                  >
                    Continue to Attributes <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: ATTRIBUTES MAPPING */}
            {wizardStep === 3 && (
              <div className="space-y-5 max-w-3xl mx-auto">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Map Amazon Listing Attributes</h3>
                  <p className="text-xs text-slate-500">
                    Map title, brand, description, bullet points, and GTIN identifier/exemption settings.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Product Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g. Premium Cotton Regular Fit T-Shirt"
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Brand Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Amazon Seller SKU <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.sellerSku}
                      onChange={(e) => setFormData({ ...formData, sellerSku: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Product Description <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  {/* Bullet Points */}
                  <div className="sm:col-span-2 space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Key Feature Bullet Points (Recommended: 3–5)
                    </label>
                    {formData.bulletPoints.map((bp, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 w-4">{idx + 1}.</span>
                        <input
                          type="text"
                          value={bp}
                          onChange={(e) => {
                            const next = [...formData.bulletPoints];
                            next[idx] = e.target.value;
                            setFormData({ ...formData, bulletPoints: next });
                          }}
                          placeholder={`Feature bullet point ${idx + 1}`}
                          className="flex-1 text-xs border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        {formData.bulletPoints.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = formData.bulletPoints.filter((_, i) => i !== idx);
                              setFormData({ ...formData, bulletPoints: next });
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {formData.bulletPoints.length < 5 && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, bulletPoints: [...formData.bulletPoints, ''] })}
                        className="text-xs text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1 mt-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Bullet Point
                      </button>
                    )}
                  </div>

                  {/* GTIN / Identifier & Exemption Section */}
                  <div className="sm:col-span-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-800">External Product ID (GTIN / Barcode)</span>
                        <p className="text-[11px] text-slate-500">
                          Amazon requires an official EAN/UPC barcode, or an approved GTIN Exemption. Never invent barcodes.
                        </p>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                        <input
                          type="checkbox"
                          checked={formData.gtinExemptionRequested}
                          onChange={(e) => setFormData({ ...formData, gtinExemptionRequested: e.target.checked })}
                          className="rounded text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-xs font-semibold text-slate-700">Request GTIN Exemption</span>
                      </label>
                    </div>

                    {!formData.gtinExemptionRequested ? (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">ID Type</label>
                          <select
                            value={formData.externalProductIdType}
                            onChange={(e) => setFormData({ ...formData, externalProductIdType: e.target.value })}
                            className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white"
                          >
                            <option value="EAN">EAN (13 digits)</option>
                            <option value="UPC">UPC (12 digits)</option>
                            <option value="ISBN">ISBN</option>
                            <option value="ASIN">ASIN</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Barcode Value</label>
                          <input
                            type="text"
                            value={formData.externalProductId}
                            onChange={(e) => setFormData({ ...formData, externalProductId: e.target.value })}
                            placeholder="Enter 12-14 digit barcode"
                            className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white font-mono"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-lg">
                        <strong>GTIN Exemption Note:</strong> When GTIN Exemption is requested, the submission payload omits the external product ID. Amazon will evaluate the brand approval status for this product type during listing submission.
                      </div>
                    )}
                  </div>

                  {/* Category-Specific Attributes */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Color</label>
                    <input
                      type="text"
                      value={formData.categoryAttributes.color}
                      onChange={(e) => setFormData({
                        ...formData,
                        categoryAttributes: { ...formData.categoryAttributes, color: e.target.value }
                      })}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Size</label>
                    <input
                      type="text"
                      value={formData.categoryAttributes.size}
                      onChange={(e) => setFormData({
                        ...formData,
                        categoryAttributes: { ...formData.categoryAttributes, size: e.target.value }
                      })}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Material / Fabric</label>
                    <input
                      type="text"
                      value={formData.categoryAttributes.material}
                      onChange={(e) => setFormData({
                        ...formData,
                        categoryAttributes: { ...formData.categoryAttributes, material: e.target.value }
                      })}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Country of Origin</label>
                    <select
                      value={formData.countryOfOrigin}
                      onChange={(e) => setFormData({ ...formData, countryOfOrigin: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5"
                    >
                      <option value="IN">India (IN)</option>
                      <option value="US">United States (US)</option>
                      <option value="CN">China (CN)</option>
                      <option value="VN">Vietnam (VN)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setWizardStep(2)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <button
                    onClick={() => setWizardStep(4)}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"
                  >
                    Continue to Images <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: IMAGES VALIDATION & SELECTION */}
            {wizardStep === 4 && (
              <div className="space-y-5 max-w-2xl mx-auto">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Product Images & Media Requirements</h3>
                  <p className="text-xs text-slate-500">
                    Amazon requires secure HTTPS image links (e.g., hosted on Cloudinary). Pure white background recommended for the main image.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Main Product Image URL <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={formData.mainImage}
                        onChange={(e) => setFormData({ ...formData, mainImage: e.target.value })}
                        placeholder="https://res.cloudinary.com/..."
                        className="flex-1 text-xs border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Main Image Preview & Real-Time Verification */}
                  {formData.mainImage ? (
                    <div
                      className={`p-3.5 rounded-xl border flex items-center gap-4 transition-colors ${
                        mainImageState === 'valid'
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : mainImageState === 'broken'
                          ? 'bg-rose-50/50 border-rose-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="w-20 h-20 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                        {mainImageState === 'checking' ? (
                          <div className="text-center p-1">
                            <RefreshCw className="w-5 h-5 animate-spin text-amber-500 mx-auto mb-1" />
                            <span className="text-[9px] text-slate-400 block">Testing...</span>
                          </div>
                        ) : mainImageState === 'broken' ? (
                          <div className="text-center p-2">
                            <ImageOff className="w-6 h-6 text-rose-500 mx-auto mb-1" />
                            <span className="text-[9px] text-rose-600 font-bold block leading-tight">Broken</span>
                          </div>
                        ) : (
                          <img
                            src={resolveProductImageUrl(formData.mainImage)}
                            alt="Main Preview"
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>

                      <div className="text-xs space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800">Main Image Status:</span>
                          {mainImageState === 'valid' && (
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Accessible & Decoded (HTTP 200)
                            </span>
                          )}
                          {mainImageState === 'broken' && (
                            <span className="text-[11px] font-semibold text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Inaccessible / Broken Link
                            </span>
                          )}
                          {mainImageState === 'checking' && (
                            <span className="text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded flex items-center gap-1">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" /> Testing URL Reachability...
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] text-slate-500 font-mono block truncate max-w-md">
                          {formData.mainImage}
                        </span>

                        {mainImageState === 'broken' && (
                          <p className="text-[11px] text-rose-600 mt-1 leading-snug">
                            {mainImageError || 'The image could not be loaded by the browser. Please paste a live, publicly accessible Cloudinary or image link.'}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 border-2 border-dashed border-amber-200 bg-amber-50/50 rounded-xl text-center text-xs text-amber-700">
                      Main image URL is missing. Please provide a valid HTTPS URL or select a product with image assets.
                    </div>
                  )}

                  {/* Additional Images */}
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Additional Images (Optional, up to 4)
                    </label>
                    {formData.otherImages.map((imgUrl, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <input
                          type="url"
                          value={imgUrl}
                          onChange={(e) => {
                            const next = [...formData.otherImages];
                            next[i] = e.target.value;
                            setFormData({ ...formData, otherImages: next });
                          }}
                          placeholder="https://..."
                          className="flex-1 text-xs border border-slate-200 rounded-lg p-2"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = formData.otherImages.filter((_, idx) => idx !== i);
                            setFormData({ ...formData, otherImages: next });
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {formData.otherImages.length < 4 && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, otherImages: [...formData.otherImages, ''] })}
                        className="text-xs text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Additional Image
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setWizardStep(3)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <button
                    onClick={() => setWizardStep(5)}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"
                  >
                    Continue to Pricing <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: OFFER & PRICING SEPARATION */}
            {wizardStep === 5 && (
              <div className="space-y-5 max-w-2xl mx-auto">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Amazon Offer & Pricing Isolation</h3>
                  <p className="text-xs text-slate-500">
                    Set channel-specific listing price and allocated inventory. Central master catalogue prices and quantities remain completely untouched.
                  </p>
                </div>

                {/* Separation Notice */}
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="text-xs text-emerald-900">
                    <span className="font-bold">Catalog Data Isolation Guaranteed:</span>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      Master Catalogue: Price ₹{selectedProduct?.masterPrice || 0} • Stock: {selectedProduct?.stock || 0}. Modifying values below will only affect the Amazon India channel submission.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Amazon Listing Price (INR) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-3 py-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Allocated Amazon Quantity <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none font-semibold"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Fulfillment Channel
                    </label>
                    <select
                      value={formData.fulfillmentChannel}
                      onChange={(e) => setFormData({ ...formData, fulfillmentChannel: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white"
                    >
                      <option value="DEFAULT">Merchant Fulfilled Network (MFN / FBM)</option>
                      <option value="AMAZON_IN_SELLER">Fulfilled by Amazon (FBA)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setWizardStep(4)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <button
                    onClick={async () => {
                      const isValid = await handleValidate();
                      setWizardStep(6);
                    }}
                    disabled={validating}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5"
                  >
                    {validating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Validating...
                      </>
                    ) : (
                      <>
                        Validate & Preview <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 6: VALIDATION & PREVIEW */}
            {wizardStep === 6 && (
              <div className="space-y-5 max-w-3xl mx-auto">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Listing Validation & Final Preview</h3>
                    <p className="text-xs text-slate-500">
                      Verify all attributes against the official Amazon SP-API Listings Items specification before submission.
                    </p>
                  </div>
                  <button
                    onClick={handleValidate}
                    disabled={validating}
                    className="p-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1 font-semibold text-slate-700"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${validating ? 'animate-spin' : ''}`} /> Re-Validate
                  </button>
                </div>

                {/* Validation Status Card */}
                {validationResult && (
                  <div
                    className={`p-4 rounded-xl border ${
                      validationResult.valid
                        ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50/60 border-rose-200 text-rose-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {validationResult.valid ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                      )}
                      <div>
                        <h4 className="text-xs font-bold">
                          {validationResult.valid
                            ? 'Listing Payload Passed Local Schema Validation'
                            : 'Listing Payload Has Validation Errors'}
                        </h4>
                        <p className="text-[11px] opacity-90">
                          {validationResult.valid
                            ? 'All required attributes and format requirements comply with SP-API v2021-08-01.'
                            : 'Please resolve the following issues before submitting.'}
                        </p>
                      </div>
                    </div>

                    {Array.isArray(validationResult.issues) && validationResult.issues.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-rose-200/60 space-y-1">
                        {validationResult.issues.map((iss, i) => (
                          <div key={i} className="text-xs flex items-center gap-1.5 text-rose-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            <span className="font-semibold font-mono text-[11px]">{iss.attribute}:</span>
                            <span>{iss.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Visual Preview Card */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Amazon Listing Mockup Preview
                    </span>
                    {mainImageState === 'broken' && (
                      <span className="text-[10px] text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Image Inaccessible in Step 4
                      </span>
                    )}
                    {mainImageState === 'valid' && (
                      <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Image Loaded & Verified
                      </span>
                    )}
                  </div>

                  {schemaData?.schemaSource === 'DEVELOPMENT_FALLBACK' ? (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-start gap-2">
                      <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-slate-700">Schema Validation Source:</span> Validated against high-fidelity local schema definition (Amazon SP-API Sandbox Definitions API unavailable for India). This verifies mandatory attributes, syntax, and payload structure according to SP-API v2021-08-01 specifications, but is not an official Amazon grant.
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-emerald-900">Official Schema Verification:</span> Validated against official Amazon Product Type Definitions API v2020-09-01.
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <div className="w-24 h-24 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                      {mainImageState === 'checking' ? (
                        <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
                      ) : mainImageState === 'broken' ? (
                        <div className="text-center p-2">
                          <ImageOff className="w-6 h-6 text-rose-400 mx-auto mb-1" />
                          <span className="text-[9px] text-rose-600 font-bold block leading-tight">Image Inaccessible</span>
                        </div>
                      ) : formData.mainImage ? (
                        <img
                          src={resolveProductImageUrl(formData.mainImage)}
                          alt="Preview"
                          className="w-full h-full object-contain"
                          onError={() => setMainImageState('broken')}
                        />
                      ) : (
                        <Package className="w-8 h-8 text-slate-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-xs font-semibold text-amber-700">{formData.brand}</div>
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">{formData.title}</h4>
                      <div className="flex items-center gap-3 pt-1">
                        <span className="text-base font-extrabold text-slate-900">₹{formData.price}</span>
                        <span className="text-[11px] text-slate-500">
                          Qty: <strong className="text-slate-800">{formData.quantity}</strong>
                        </span>
                        <span className="text-[11px] text-slate-500">
                          SKU: <strong className="font-mono text-slate-800">{formData.sellerSku}</strong>
                        </span>
                        <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {formData.fulfillmentChannel === 'DEFAULT' ? 'MFN / Seller' : 'FBA'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                    <p className="line-clamp-2">{formData.description}</p>
                    <ul className="list-disc pl-4 text-[11px] text-slate-500 space-y-0.5 pt-1">
                      {formData.bulletPoints.filter(Boolean).map((b, idx) => (
                        <li key={idx}>{b}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Raw SP-API Payload Preview Accordion */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowJsonPayload(!showJsonPayload)}
                    className="w-full px-4 py-2.5 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <span className="flex items-center gap-1.5 font-mono">
                      <FileCode className="w-4 h-4 text-amber-600" /> Official SP-API v2021-08-01 JSON Payload
                    </span>
                    <span className="text-[11px] text-slate-400">{showJsonPayload ? 'Hide' : 'Show Payload'}</span>
                  </button>

                  {showJsonPayload && (
                    <div className="p-3 bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-64">
                      <pre>
                        {JSON.stringify(
                          {
                            productType: selectedProductType,
                            requirements: 'LISTING',
                            attributes: {
                              item_name: [{ value: formData.title, marketplace_id: 'A21TJRUUN4KGV' }],
                              brand: [{ value: formData.brand, marketplace_id: 'A21TJRUUN4KGV' }],
                              description: [{ value: formData.description, marketplace_id: 'A21TJRUUN4KGV' }],
                              bullet_point: formData.bulletPoints.filter(Boolean).map(bp => ({ value: bp, marketplace_id: 'A21TJRUUN4KGV' })),
                              main_product_image_locator: [{ media_location: formData.mainImage, marketplace_id: 'A21TJRUUN4KGV' }],
                              purchasable_offer: [{
                                currency: 'INR',
                                our_price: [{ schedule: [{ value_with_tax: Number(formData.price) }] }],
                                marketplace_id: 'A21TJRUUN4KGV'
                              }],
                              fulfillment_availability: [{
                                quantity: Number(formData.quantity),
                                fulfillment_channel_code: formData.fulfillmentChannel,
                                marketplace_id: 'A21TJRUUN4KGV'
                              }],
                              country_of_origin: [{ value: formData.countryOfOrigin, marketplace_id: 'A21TJRUUN4KGV' }],
                              ...(!formData.gtinExemptionRequested && formData.externalProductId ? {
                                extern_id: [{ type: formData.externalProductIdType, value: formData.externalProductId, marketplace_id: 'A21TJRUUN4KGV' }]
                              } : {})
                            }
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setWizardStep(5)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <button
                    onClick={() => setWizardStep(7)}
                    disabled={validationResult && !validationResult.valid}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    Proceed to Submission <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 7: SUBMISSION / DRY-RUN */}
            {wizardStep === 7 && (
              <div className="space-y-5 max-w-2xl mx-auto">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Submit Listing to Amazon India (Sandbox)</h3>
                  <p className="text-xs text-slate-500">
                    Execute an honest local dry-run or perform an official SP-API Sandbox submission.
                  </p>
                </div>

                {/* Submission Action Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Action 1: Dry-Run */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:border-amber-400 space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      <h4 className="text-xs font-bold text-slate-900">High-Fidelity Dry-Run</h4>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Validates payload syntax and schema constraints completely in local sandbox mode. Stores immutable submission snapshot without calling external Amazon endpoints.
                    </p>
                    <button
                      onClick={() => handleSubmit('DRY_RUN')}
                      disabled={submitting}
                      className="w-full py-2 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-lg shadow-2xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                      Execute Dry-Run
                    </button>
                  </div>

                  {/* Action 2: Sandbox Submission */}
                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 hover:border-amber-500 space-y-3">
                    <div className="flex items-center gap-2">
                      <Send className="w-5 h-5 text-amber-600" />
                      <h4 className="text-xs font-bold text-slate-900">Sandbox SP-API Submission</h4>
                    </div>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      Submits the payload via <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-[10px]">PUT /listings/2021-08-01</code> to the official EU Sandbox endpoint using India Marketplace ID.
                    </p>
                    <button
                      onClick={() => handleSubmit('SANDBOX_SUBMISSION')}
                      disabled={submitting}
                      className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Submit to Sandbox
                    </button>
                  </div>
                </div>

                {/* Submission Result Display */}
                {submissionResult && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Submission Response Details
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-bold">
                        STATUS: {submissionResult.data?.status || 'SUBMITTED'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <span className="text-[10px] text-slate-400 block uppercase">Mode</span>
                        <span className="font-mono font-semibold">{submissionResult.data?.submissionMode}</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <span className="text-[10px] text-slate-400 block uppercase">Submission / Tracking ID</span>
                        <span className="font-mono font-semibold truncate block">
                          {submissionResult.data?.amazonSubmissionId || 'DRY-RUN-NO-EXTERNAL-ID'}
                        </span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <span className="text-[10px] text-slate-400 block uppercase">Seller SKU</span>
                        <span className="font-mono font-semibold">{submissionResult.data?.sellerSku}</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <span className="text-[10px] text-slate-400 block uppercase">Marketplace ID</span>
                        <span className="font-mono font-semibold">{submissionResult.data?.marketplaceId}</span>
                      </div>
                    </div>

                    {submissionResult.data?.responseMetadata && (
                      <div className="p-2.5 bg-slate-900 text-slate-200 rounded-lg text-[10px] font-mono overflow-x-auto">
                        <span className="text-slate-400 block mb-1">Response Diagnostic Metadata:</span>
                        <pre>{JSON.stringify(submissionResult.data.responseMetadata, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setWizardStep(6)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Preview
                  </button>
                  <button
                    onClick={() => {
                      setSubView('history');
                      fetchHistory();
                    }}
                    className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                  >
                    View Submissions History <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBVIEW 2: SUBMISSIONS HISTORY */}
      {subView === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Amazon Listing Submissions Log</h3>
              <p className="text-xs text-slate-500">
                Audit trail of all listing submissions, dry runs, and sandbox payloads for this seller.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by SKU or type..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                onClick={fetchHistory}
                disabled={historyLoading}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                title="Refresh history"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Seller SKU</th>
                  <th className="py-2.5 px-3">Product Type</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Amazon Submission ID</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyLoading ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
                      Loading submissions history...
                    </td>
                  </tr>
                ) : (!Array.isArray(historyList) || historyList.length === 0) ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-400">
                      <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-600">No listing submissions found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Click "New Listing Wizard" above to prepare your first Amazon listing.
                      </p>
                    </td>
                  </tr>
                ) : (
                  (Array.isArray(historyList) ? historyList : [])
                    .filter(
                      (item) =>
                        !historySearch ||
                        item.sellerSku?.toLowerCase().includes(historySearch.toLowerCase()) ||
                        item.productType?.toLowerCase().includes(historySearch.toLowerCase())
                    )
                    .map((item) => (
                      <tr key={item._id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                          {item.sellerSku}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">
                          {item.productType}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.submissionMode === 'SANDBOX_SUBMISSION'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.submissionMode}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                              item.status === 'ACCEPTED' || item.status === 'SUBMITTED' || item.status === 'SANDBOX_SUBMITTED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.status === 'DRY_RUN' || item.status === 'DRY_RUN_COMPLETED'
                                ? 'bg-blue-100 text-blue-800'
                                : item.status === 'READY'
                                ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                : item.status === 'VALIDATION_FAILED' || item.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {item.status === 'READY'
                              ? 'READY (LOCAL DRAFT)'
                              : item.status === 'DRY_RUN' || item.status === 'DRY_RUN_COMPLETED'
                              ? 'DRY RUN COMPLETED'
                              : item.status === 'SANDBOX_SUBMITTED'
                              ? 'SANDBOX SUBMITTED'
                              : item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 truncate max-w-xs">
                          {item.amazonSubmissionId ? (
                            <span className="text-emerald-700 font-semibold">{item.amazonSubmissionId}</span>
                          ) : (
                            <span className="text-slate-400 italic">— (Local Dry Run)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400">
                          {new Date(item.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => setSelectedHistoryItem(item)}
                            className="text-amber-600 hover:text-amber-700 font-semibold text-[11px] flex items-center gap-1 ml-auto"
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History Detail Modal */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Submission Snapshot: {selectedHistoryItem.sellerSku}
                </h4>
                <p className="text-[11px] text-slate-500 font-mono">
                  ID: {selectedHistoryItem._id} • Mode: {selectedHistoryItem.submissionMode}
                </p>
              </div>
              <button
                onClick={() => setSelectedHistoryItem(null)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-400 block uppercase">Status</span>
                  <span className="font-bold text-slate-800">{selectedHistoryItem.status}</span>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-400 block uppercase">Product Type</span>
                  <span className="font-bold text-slate-800">{selectedHistoryItem.productType}</span>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-400 block uppercase">Marketplace</span>
                  <span className="font-bold text-slate-800">{selectedHistoryItem.marketplaceId}</span>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-400 block uppercase">Environment</span>
                  <span className="font-bold text-slate-800">{selectedHistoryItem.environment}</span>
                </div>
              </div>

              {selectedHistoryItem.payloadPreview && (
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Prepared SP-API Payload:</span>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[10px] font-mono overflow-x-auto max-h-56">
                    {JSON.stringify(selectedHistoryItem.payloadPreview, null, 2)}
                  </pre>
                </div>
              )}

              {selectedHistoryItem.responseMetadata && (
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Response Diagnostic Metadata:</span>
                  <pre className="p-3 bg-slate-100 text-slate-800 rounded-xl text-[10px] font-mono overflow-x-auto max-h-40 border border-slate-200">
                    {JSON.stringify(selectedHistoryItem.responseMetadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setSelectedHistoryItem(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
