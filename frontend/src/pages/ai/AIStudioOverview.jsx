import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Image as ImageIcon,
  FileText,
  Tag,
  FolderTree,
  CheckCircle2,
  TrendingUp,
  MessageSquare,
  Zap,
  Upload,
  RefreshCw,
  Send,
  AlertCircle,
  ArrowRight,
  Check,
  Package,
  X,
  Eye,
  HelpCircle,
  Copy,
  Camera,
  Layers,
  Sliders,
  Globe,
  Plus,
  Trash2,
} from 'lucide-react';
import { generateProductAIApi, analyzeProductImageApi, generateListingDraftApi } from '../../services/aiService';
import { createProductApi, uploadProductImageApi } from '../../services/productService';
import { getAiInsightsApi, askAiAssistantApi } from '../../services/aiIntelligenceService';

export default function AIStudioOverview() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('AI Vision Studio');

  // ==========================================
  // PHASE 03.2: AI VISION STUDIO STATE
  // ==========================================
  const fileInputRef = useRef(null);
  const [visionStep, setVisionStep] = useState(1); // 1: Upload & Pre-flight, 2: Review & Edit Vision Intelligence
  const [visionFile, setVisionFile] = useState(null);
  const [visionPreview, setVisionPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [visionUserHint, setVisionUserHint] = useState('');
  const [visionEnableOcr, setVisionEnableOcr] = useState(true);
  const [isAnalyzingVision, setIsAnalyzingVision] = useState(false);
  const [visionProgress, setVisionProgress] = useState(0);
  const [visionError, setVisionError] = useState(null);
  const [copiedOcr, setCopiedOcr] = useState(false);
  const [visionToken, setVisionToken] = useState(null);
  const [visionTokenExpiry, setVisionTokenExpiry] = useState(null);
  const isVisionTokenExpired = Boolean(
    visionTokenExpiry && new Date(visionTokenExpiry).getTime() <= Date.now()
  );

  // Validated Vision Result & Editable Fields
  const [visionProductType, setVisionProductType] = useState('');
  const [visionVisualDescription, setVisionVisualDescription] = useState('');
  const [visionCategory, setVisionCategory] = useState({
    primary_category: '',
    subcategory: '',
    confidence: 0,
    uncertainty_status: '',
    reasoning: '',
    alternative_categories: [],
  });
  const [visionAttributes, setVisionAttributes] = useState([]);
  const [visionOcr, setVisionOcr] = useState({
    status: '',
    extracted_text: '',
    segments: [],
    segment_count: 0,
    engine: '',
    execution_time_ms: 0,
  });
  const [visionUncertainties, setVisionUncertainties] = useState([]);
  const [visionMultipleProducts, setVisionMultipleProducts] = useState(false);
  const [visionImageMeta, setVisionImageMeta] = useState(null);
  const [visionProcessingMeta, setVisionProcessingMeta] = useState(null);

  // ==========================================
  // PHASE 03.3.4: GROUNDED LISTING ORCHESTRATION & DRAFT STATE
  // ==========================================
  const [rawVisionData, setRawVisionData] = useState(null); // Intact original vision response for restart fallback
  const [focalProductSelection, setFocalProductSelection] = useState('');
  const [preferredTitle, setPreferredTitle] = useState('');
  const [preferredBrand, setPreferredBrand] = useState('');
  const [sellerAdditionalDetails, setSellerAdditionalDetails] = useState('');

  // Seller Listing Preferences
  const [listingTone, setListingTone] = useState('artisan');
  const [listingTargetAudience, setListingTargetAudience] = useState('');
  const [listingMarketplaceFocus, setListingMarketplaceFocus] = useState('general');
  const [listingIncludeStylingTips, setListingIncludeStylingTips] = useState(false);

  // Listing Generation Progress & Error States
  const [isGeneratingListing, setIsGeneratingListing] = useState(false);
  const [listingError, setListingError] = useState(null);
  const [generatedDraft, setGeneratedDraft] = useState(null);
  const [draftMetadata, setDraftMetadata] = useState(null);

  // Step 3: Editable Draft Review States
  const [listingTitle, setListingTitle] = useState('');
  const [listingShortDesc, setListingShortDesc] = useState('');
  const [listingDesc, setListingDesc] = useState('');
  const [listingProductType, setListingProductType] = useState('');
  const [listingCategoryPrimary, setListingCategoryPrimary] = useState('');
  const [listingCategorySub, setListingCategorySub] = useState('');
  const [listingBrand, setListingBrand] = useState('');
  const [listingAttributes, setListingAttributes] = useState([]);
  const [listingBulletPoints, setListingBulletPoints] = useState([]);
  const [listingKeywords, setListingKeywords] = useState([]);
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [listingSeo, setListingSeo] = useState({ meta_title: '', meta_description: '', slug: '' });
  const [listingConfirmationFields, setListingConfirmationFields] = useState([]);
  const [listingValidationWarnings, setListingValidationWarnings] = useState([]);
  const [listingIsFallback, setListingIsFallback] = useState(false);
  const [listingAiProvider, setListingAiProvider] = useState('openai');

  // Step 3: Master Product Persistence States
  const [listingSku, setListingSku] = useState('');
  const [listingPrice, setListingPrice] = useState('1299');
  const [listingCostPrice, setListingCostPrice] = useState('0');
  const [listingStock, setListingStock] = useState('50');
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingMasterProduct, setIsSavingMasterProduct] = useState(false);
  const [masterProductSuccess, setMasterProductSuccess] = useState(null);

  // ==========================================
  // LEGACY TAB: AI PRODUCT GENERATOR STATE
  // ==========================================
  const [genStep, setGenStep] = useState(1);
  const [promptInput, setPromptInput] = useState('Handcrafted Jaipur Cotton Kurta with Floral Embroidery');
  const [categoryInput, setCategoryInput] = useState('Fashion');
  const [brandInput, setBrandInput] = useState('Bhartiye Crafts');
  const [materialInput, setMaterialInput] = useState('Pure Cotton');
  const [colorInput, setColorInput] = useState('Indigo Blue');
  const [priceInput, setPriceInput] = useState('1299');
  const [skuInput, setSkuInput] = useState('JK-COT-001');
  const [stockInput, setStockInput] = useState('50');

  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftShortDesc, setDraftShortDesc] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [draftBrand, setDraftBrand] = useState('');
  const [draftMaterial, setDraftMaterial] = useState('');
  const [draftColor, setDraftColor] = useState('');
  const [draftAttributes, setDraftAttributes] = useState({});
  const [draftKeywords, setDraftKeywords] = useState([]);
  const [draftTags, setDraftTags] = useState([]);
  const [draftSeo, setDraftSeo] = useState({});
  const [draftIsFallback, setDraftIsFallback] = useState(false);
  const [draftAiProvider, setDraftAiProvider] = useState('openai');

  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [createdProduct, setCreatedProduct] = useState(null);

  // ==========================================
  // LEGACY TAB: AI ASSISTANT CHAT STATE
  // ==========================================
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hi! I am your AI Business Assistant. Ask me anything about your product listings, market trends, or inventory stock.' },
  ]);

  // ==========================================
  // PHASE 03.2: VISION UPLOAD & HANDLERS
  // ==========================================
  const handleFileValidateAndSelect = (file) => {
    setVisionError(null);
    if (!file) return;

    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const normType = file.type?.toLowerCase();
    if (!validMimes.includes(normType)) {
      setVisionError(`Unsupported format '${file.type || 'unknown'}'. Please upload a JPEG, PNG, or WebP image.`);
      return;
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      setVisionError(`Image size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 10 MB.`);
      return;
    }

    if (file.size === 0) {
      setVisionError('Selected image file is empty (0 bytes).');
      return;
    }

    if (visionPreview) {
      URL.revokeObjectURL(visionPreview);
    }

    setVisionFile(file);
    setVisionPreview(URL.createObjectURL(file));
    setUploadedImageUrl(null);
    setVisionToken(null);
    setVisionTokenExpiry(null);
    setRawVisionData(null);
    setFocalProductSelection('');
    setSellerAdditionalDetails('');
    setPreferredTitle('');
    setPreferredBrand('');
    setGeneratedDraft(null);
    setDraftMetadata(null);
    setListingError(null);
    setMasterProductSuccess(null);
  };

  const handleRemoveFile = () => {
    if (visionPreview) {
      URL.revokeObjectURL(visionPreview);
    }
    setVisionFile(null);
    setVisionPreview(null);
    setUploadedImageUrl(null);
    setVisionError(null);
    setVisionProgress(0);
    setVisionToken(null);
    setVisionTokenExpiry(null);
    setRawVisionData(null);
    setFocalProductSelection('');
    setSellerAdditionalDetails('');
    setPreferredTitle('');
    setPreferredBrand('');
    setGeneratedDraft(null);
    setDraftMetadata(null);
    setListingError(null);
    setMasterProductSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAnalyzePhoto = async (e) => {
    e?.preventDefault();
    setVisionError(null);
    setVisionToken(null);
    setVisionTokenExpiry(null);
    setRawVisionData(null);
    setGeneratedDraft(null);
    setDraftMetadata(null);
    setListingError(null);

    if (!visionFile) {
      setVisionError('Please select or drop a product image to analyze.');
      return;
    }

    setIsAnalyzingVision(true);
    setVisionProgress(0);

    const formData = new FormData();
    formData.append('image', visionFile, visionFile.name || 'product.jpg');
    if (visionUserHint && visionUserHint.trim()) {
      formData.append('user_hint', visionUserHint.trim());
    }
    formData.append('enable_ocr', String(visionEnableOcr));

    try {
      const res = await analyzeProductImageApi(formData, (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setVisionProgress(percent);
        }
      });

      const v = res?.data?.vision || res?.vision;
      if (!v) {
        throw new Error('AI service response did not contain validated vision data.');
      }

      const token = res?.data?.vision_token || res?.vision_token || null;
      const expiresAt = res?.data?.expires_at || res?.expires_at || null;
      setVisionToken(token);
      setVisionTokenExpiry(expiresAt);
      setRawVisionData(v);

      setVisionProductType(v.product_type || '');
      setVisionVisualDescription(v.visual_description || '');
      setVisionCategory(v.category || {
        primary_category: '',
        subcategory: '',
        confidence: 0,
        uncertainty_status: '',
        reasoning: '',
        alternative_categories: [],
      });
      setVisionAttributes(Array.isArray(v.attributes) ? [...v.attributes] : []);
      setVisionOcr(v.ocr || {
        status: 'no_text_detected',
        extracted_text: '',
        segments: [],
        segment_count: 0,
        engine: 'PaddleOCR',
        execution_time_ms: 0,
      });
      setVisionUncertainties(Array.isArray(v.uncertainties) ? v.uncertainties : []);
      setVisionMultipleProducts(Boolean(v.multiple_products_detected));
      setVisionImageMeta(v.image_metadata || null);
      setVisionProcessingMeta(v.processing_metadata || null);

      setVisionStep(2); // Advance to Review & Edit Step
    } catch (err) {
      setVisionToken(null);
      setVisionTokenExpiry(null);
      setVisionError(err.message || 'Vision analysis failed. Please verify AI microservice connection.');
    } finally {
      setIsAnalyzingVision(false);
    }
  };

  const handleUpdateAttributeValue = (idx, newValue) => {
    setVisionAttributes((prev) => {
      const updated = [...prev];
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], value: newValue };
      }
      return updated;
    });
  };

  const handleCopyOcrText = () => {
    if (visionOcr?.extracted_text) {
      navigator.clipboard?.writeText(visionOcr.extracted_text);
      setCopiedOcr(true);
      setTimeout(() => setCopiedOcr(false), 2000);
    }
  };

  // Uncertainty & Confidence Presentation Badges
  const renderConfidenceBadge = (confidence) => {
    const pct = Math.round((confidence ?? 0) * 100);
    let color = 'bg-red-50 text-red-700 border-red-200';
    if (pct >= 85) {
      color = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (pct >= 60) {
      color = 'bg-amber-50 text-amber-700 border-amber-200';
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${color}`}>
        {pct}% confidence
      </span>
    );
  };

  const renderUncertaintyPill = (status) => {
    switch (status) {
      case 'confirmed_observation':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Confirmed Observation
          </span>
        );
      case 'reasonable_inference':
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300"
            title="Inferred from visual styling; verify before publishing"
          >
            <Sparkles className="w-3 h-3 text-purple-600" />
            Reasonable Inference
          </span>
        );
      case 'uncertain':
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300"
            title="Visual ambiguity detected by model"
          >
            <AlertCircle className="w-3 h-3 text-amber-600" />
            Uncertain
          </span>
        );
      case 'unknown':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <HelpCircle className="w-3 h-3 text-slate-500" />
            Unknown
          </span>
        );
    }
  };

  const renderEvidenceSourcePill = (source) => {
    const labels = {
      vision_model: 'Multimodal Vision',
      ocr: 'PaddleOCR',
      image_processing: 'Image Analysis',
      combined: 'Combined Evidence',
      inferred: 'Stylistic Inference',
    };
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
        src: {labels[source] || source}
      </span>
    );
  };

  // ==========================================
  // PHASE 03.3.4: GROUNDED LISTING ORCHESTRATION HELPERS & HANDLERS
  // ==========================================
  const renderListingProvenanceBadge = (provenance, isConfirmationRequired) => {
    if (isConfirmationRequired) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
          <AlertCircle className="w-3 h-3 text-amber-600" />
          Requires Confirmation
        </span>
      );
    }
    switch (provenance) {
      case 'vision_observation':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Verified Vision
          </span>
        );
      case 'seller_provided':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <Tag className="w-3 h-3 text-blue-600" />
            Seller Provided
          </span>
        );
      case 'vision_inference':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
            <Sparkles className="w-3 h-3 text-purple-600" />
            Reasonable Inference
          </span>
        );
    }
  };

  const buildSellerCorrections = () => {
    const corrections = {};

    if (preferredTitle.trim()) {
      corrections.preferred_title = preferredTitle.trim();
    }
    if (preferredBrand.trim()) {
      corrections.preferred_brand = preferredBrand.trim();
    }
    if (visionProductType.trim() && visionProductType.trim() !== (rawVisionData?.product_type || '').trim()) {
      corrections.corrected_product_type = visionProductType.trim();
    }
    if (
      (visionCategory.primary_category && visionCategory.primary_category !== rawVisionData?.category?.primary_category) ||
      (visionCategory.subcategory && visionCategory.subcategory !== rawVisionData?.category?.subcategory)
    ) {
      corrections.corrected_category = {
        primary_category: (visionCategory.primary_category || '').trim(),
        subcategory: (visionCategory.subcategory || '').trim(),
      };
    }
    if (sellerAdditionalDetails.trim()) {
      corrections.additional_details = sellerAdditionalDetails.trim();
    }

    const overrides = {};
    if (Array.isArray(visionAttributes)) {
      visionAttributes.forEach((attr) => {
        const orig = rawVisionData?.attributes?.find((a) => a.name === attr.name);
        if (!orig || (orig.value || '').trim() !== (attr.value || '').trim()) {
          overrides[attr.name] = (attr.value || '').trim();
        }
      });
    }
    if (Object.keys(overrides).length > 0) {
      corrections.attribute_overrides = overrides;
    }

    if (visionMultipleProducts && focalProductSelection.trim()) {
      corrections.focal_product_selection = focalProductSelection.trim();
    }

    return Object.keys(corrections).length > 0 ? corrections : null;
  };

  const handleGenerateListingDraft = async () => {
    setListingError(null);

    if (!visionToken) {
      setListingError('No active vision token found. Please re-analyze the product photo.');
      return;
    }

    if (isVisionTokenExpired) {
      setListingError('Vision token has expired. Please re-analyze the product photo to establish a valid cryptographic session.');
      return;
    }

    if (visionMultipleProducts && !focalProductSelection.trim()) {
      setListingError('Multiple products detected in frame. Please specify which product to feature under Focal Product Selection.');
      return;
    }

    setIsGeneratingListing(true);

    try {
      const payload = {
        vision_token: visionToken,
        seller_corrections: buildSellerCorrections(),
        client_vision_data: rawVisionData || null,
        preferences: {
          tone: listingTone,
          target_audience: listingTargetAudience.trim() || undefined,
          marketplace_focus: listingMarketplaceFocus,
          include_styling_tips: listingIncludeStylingTips,
        },
      };

      const res = await generateListingDraftApi(payload);
      const draft = res?.data?.draft || res?.draft;
      const metadata = res?.data?.metadata || res?.metadata;
      const isFallback = Boolean(res?.data?.isFallback || res?.isFallback || metadata?.is_fallback);
      const aiProvider = res?.data?.aiProvider || metadata?.ai_provider || (isFallback ? 'fallback' : 'ai');

      if (!draft) {
        throw new Error('AI backend did not return a valid listing draft.');
      }

      setGeneratedDraft(draft);
      setDraftMetadata(metadata);

      // Populate draft review states
      setListingTitle(draft.title || '');
      setListingShortDesc(draft.short_description || '');
      setListingDesc(draft.description || '');
      setListingProductType(draft.product_type || visionProductType || '');
      setListingCategoryPrimary(draft.category?.primary_category || visionCategory.primary_category || '');
      setListingCategorySub(draft.category?.subcategory || visionCategory.subcategory || '');
      setListingBrand(draft.brand || preferredBrand || 'Bhartiye Crafts');
      setListingAttributes(Array.isArray(draft.attributes) ? [...draft.attributes] : []);
      setListingBulletPoints(Array.isArray(draft.bullet_points) ? [...draft.bullet_points] : []);
      setListingKeywords(Array.isArray(draft.search_keywords) ? [...draft.search_keywords] : []);
      setListingSeo(draft.seo || { meta_title: '', meta_description: '', slug: '' });
      setListingConfirmationFields(Array.isArray(draft.fields_requiring_seller_confirmation) ? draft.fields_requiring_seller_confirmation : []);
      setListingValidationWarnings(Array.isArray(draft.validation_warnings) ? draft.validation_warnings : []);
      setListingIsFallback(isFallback);
      setListingAiProvider(aiProvider);

      // Generate suggested SKU
      const prefix = (draft.brand || 'BC').slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'BC');
      const code = Math.floor(100 + Math.random() * 900);
      setListingSku(`${prefix}-${code}`);

      setVisionStep(3); // Advance to Step 3: Review Generated Listing Draft
    } catch (err) {
      if (err.code === 'VISION_TOKEN_EXPIRED' || err.code === 'VISION_RESULT_EXPIRED') {
        setListingError('Vision analysis token has expired. Please re-analyze the image to establish a valid session.');
      } else if (err.code === 'FOCAL_PRODUCT_SELECTION_REQUIRED') {
        setListingError('Multiple products detected. Please provide a focal product selection in seller corrections.');
      } else {
        setListingError(err.message || 'Listing generation failed. Please try again.');
      }
    } finally {
      setIsGeneratingListing(false);
    }
  };

  const handleUpdateDraftAttribute = (idx, field, val) => {
    setListingAttributes((prev) => {
      const updated = [...prev];
      if (updated[idx]) {
        updated[idx] = { ...updated[idx], [field]: val };
      }
      return updated;
    });
  };

  const handleUpdateBulletPoint = (idx, val) => {
    setListingBulletPoints((prev) => {
      const updated = [...prev];
      updated[idx] = val;
      return updated;
    });
  };

  const handleAddBulletPoint = () => {
    if (listingBulletPoints.length < 6) {
      setListingBulletPoints((prev) => [...prev, 'High quality handcrafted details suitable for modern living']);
    }
  };

  const handleRemoveBulletPoint = (idx) => {
    if (listingBulletPoints.length > 3) {
      setListingBulletPoints((prev) => prev.filter((_, i) => i !== idx));
    }
  };

  const handleAddKeyword = (e) => {
    e?.preventDefault();
    const kw = newKeywordInput.trim().toLowerCase();
    if (kw && !listingKeywords.includes(kw) && listingKeywords.length < 25) {
      setListingKeywords((prev) => [...prev, kw]);
      setNewKeywordInput('');
    }
  };

  const handleRemoveKeyword = (kwToRemove) => {
    if (listingKeywords.length > 3) {
      setListingKeywords((prev) => prev.filter((k) => k !== kwToRemove));
    }
  };

  const handleApproveAndCreateMasterProduct = async () => {
    setListingError(null);

    // 1. Guard against duplicate concurrent submissions
    if (isSavingMasterProduct || isUploadingImage) {
      return;
    }

    // 2. Validate essential fields
    if (!listingTitle.trim()) {
      setListingError('Product Title cannot be empty.');
      return;
    }
    if (!listingSku.trim()) {
      setListingError('SKU is required.');
      return;
    }
    if (listingPrice === '' || isNaN(Number(listingPrice)) || Number(listingPrice) < 0) {
      setListingError('Valid master price (>= 0) is required.');
      return;
    }

    // 3. Verify AIJob linkage identifier (result_id)
    const aiJobId = draftMetadata?.result_id;
    if (!aiJobId) {
      setListingError('Missing AI generation linkage identifier (result_id). Please regenerate the listing draft before approving.');
      return;
    }

    // 4. Permanent Image Persistence: Upload original visionFile or reuse cached URL
    let permanentUrl = uploadedImageUrl;
    if (!permanentUrl) {
      if (!visionFile) {
        setListingError('Original product photo is missing. Please re-upload the photo before approving.');
        return;
      }

      setIsUploadingImage(true);
      try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = (err) => reject(new Error('Failed to read image file data.'));
        });
        reader.readAsDataURL(visionFile);
        const base64Data = await base64Promise;

        const uploadRes = await uploadProductImageApi({
          image: base64Data,
          fileName: visionFile.name || 'product-image.jpg',
          mimeType: visionFile.type || 'image/jpeg',
        });

        permanentUrl =
          uploadRes?.data?.secure_url ||
          uploadRes?.data?.url ||
          uploadRes?.data?.local_url ||
          uploadRes?.secure_url ||
          uploadRes?.url ||
          uploadRes?.local_url;

        if (!permanentUrl) {
          throw new Error('Image upload succeeded but did not return a valid permanent image URL.');
        }

        // Cache the uploaded URL in component state so any subsequent creation retry does not re-upload
        setUploadedImageUrl(permanentUrl);
      } catch (uploadErr) {
        setListingError(`Image upload failed: ${uploadErr.message || 'Unable to store product image.'}`);
        setIsUploadingImage(false);
        return; // Do NOT proceed to product creation if image upload fails
      } finally {
        setIsUploadingImage(false);
      }
    }

    // Safety check: ensure permanentUrl is never a temporary blob or data URI
    if (!permanentUrl || permanentUrl.startsWith('blob:') || permanentUrl.startsWith('data:')) {
      setListingError('Invalid image URL: Temporary browser blob/data URLs cannot be persisted in the catalog.');
      return;
    }

    // 5. Submit Master Product Creation with complete AI-generated listing fields
    setIsSavingMasterProduct(true);

    try {
      const attributeMap = {};
      if (Array.isArray(listingAttributes)) {
        listingAttributes.forEach((attr) => {
          if (attr.name && attr.value !== undefined && attr.value !== null && String(attr.value).trim() !== '') {
            attributeMap[attr.name] = String(attr.value).trim();
          }
        });
      }

      const payload = {
        title: listingTitle.trim(),
        shortDescription: listingShortDesc.trim(),
        description: listingDesc.trim(),
        brand: listingBrand.trim() || 'Bhartiye Crafts',
        productType: listingProductType.trim(),
        category: listingCategoryPrimary || 'Fashion',
        categoryName: listingCategoryPrimary || 'Fashion',
        subcategory: listingCategorySub.trim(),
        bulletPoints: Array.isArray(listingBulletPoints)
          ? listingBulletPoints.map((bp) => String(bp).trim()).filter(Boolean)
          : [],
        keywords: Array.isArray(listingKeywords) ? listingKeywords : [],
        attributes: attributeMap,
        material: attributeMap.material || attributeMap.Material || attributeMap.wood_type || '',
        color: attributeMap.primary_color || attributeMap.color || attributeMap.Color || '',
        seo: {
          title: listingSeo?.meta_title || listingSeo?.title || listingTitle.trim(),
          description: listingSeo?.meta_description || listingSeo?.description || listingShortDesc.trim(),
          keywords: Array.isArray(listingKeywords) ? listingKeywords : [],
          slug: listingSeo?.slug || '',
        },
        sku: listingSku.trim().toUpperCase(),
        masterPrice: Number(listingPrice),
        costPrice: Number(listingCostPrice) || 0,
        stock: Number(listingStock) || 0,
        images: [permanentUrl],
        tags: ['ai-vision-grounded', ...(listingIsFallback ? ['grounded-fallback'] : ['llm-generated'])],
        aiJobId: aiJobId,
        aiApproved: true,
        aiGenerated: true,
      };

      const res = await createProductApi(payload);
      const created = res?.data?.product || res?.product || res?.data || res;
      setMasterProductSuccess(created);
      setVisionStep(4);
    } catch (err) {
      setListingError(err.message || 'Failed to save master product in catalog.');
    } finally {
      setIsSavingMasterProduct(false);
    }
  };

  // ==========================================
  // LEGACY: TEXT-BASED GENERATE & PRODUCT SAVE
  // ==========================================
  const handleGenerateAI = async (e) => {
    e?.preventDefault();
    setGenError(null);

    if (!promptInput.trim()) {
      setGenError('Please enter a product description or hint for AI generation.');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await generateProductAIApi({
        prompt: promptInput.trim(),
        category: categoryInput,
        brand: brandInput,
        material: materialInput,
        color: colorInput,
      });

      const draft = res?.data?.draft || res?.draft || res;
      const isFallback = res?.data?.isFallback ?? res?.isFallback ?? draft?.isFallback ?? false;
      const provider = res?.data?.aiProvider || draft?.aiProvider || (isFallback ? 'fallback' : 'openai');

      if (draft) {
        setDraftTitle(draft.title || `${brandInput} ${promptInput}`);
        setDraftShortDesc(draft.shortDescription || '');
        setDraftDesc(draft.description || '');
        setDraftCategory(draft.category || categoryInput);
        setDraftBrand(draft.brand || brandInput);
        setDraftMaterial(draft.material || materialInput);
        setDraftColor(draft.color || colorInput);
        setDraftAttributes(draft.attributes || {});
        setDraftKeywords(draft.keywords || []);
        setDraftTags(draft.tags || ['ai-generated']);
        setDraftSeo(draft.seo || {});
        setDraftIsFallback(isFallback);
        setDraftAiProvider(provider);
        setGenStep(2);
      } else {
        setGenError('Failed to generate product draft. Please try again.');
      }
    } catch (err) {
      setGenError(err.message || 'AI generation failed. Please check server logs.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveAndCreate = async () => {
    setGenError(null);
    if (!draftTitle.trim()) {
      setGenError('Product Title cannot be empty.');
      return;
    }
    if (!skuInput.trim()) {
      setGenError('SKU is required.');
      return;
    }
    if (priceInput === '' || isNaN(Number(priceInput)) || Number(priceInput) < 0) {
      setGenError('Valid master price (>= 0) is required.');
      return;
    }

    setIsCreatingProduct(true);
    try {
      const payload = {
        title: draftTitle.trim(),
        shortDescription: draftShortDesc.trim(),
        description: draftDesc.trim(),
        category: draftCategory || categoryInput,
        brand: draftBrand || brandInput,
        sku: skuInput.trim().toUpperCase(),
        masterPrice: Number(priceInput),
        material: draftMaterial || materialInput,
        color: draftColor || colorInput,
        stock: Number(stockInput) || 0,
        attributes: draftAttributes,
        keywords: draftKeywords,
        tags: draftTags,
        seo: draftSeo,
        aiGenerated: true,
        aiApproved: true,
      };

      const res = await createProductApi(payload);
      const created = res?.data?.product || res?.product || res?.data || res;
      setCreatedProduct(created);
      setGenStep(3);
    } catch (err) {
      setGenError(err.message || 'Failed to save product in MongoDB catalog.');
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const handleSendChat = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userText = chatInput.trim();
    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const res = await askAiAssistantApi({ query: userText });
      const reply = res?.data?.reply || res?.reply || 'I processed your query. Let me know if you need listing advice or analytics.';
      setMessages((prev) => [...prev, { sender: 'ai', text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: 'ai', text: 'Thank you for your question. Connect to the backend store database for tailored inventory insights.' },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const aiTools = [
    { id: 'vision', title: 'AI Vision Studio', desc: 'Real photo upload, PaddleOCR & Gemini Multimodal intelligence', icon: Camera, color: 'bg-indigo-50 text-indigo-600' },
    { id: 'product', title: 'AI Product Generator', desc: 'Create complete product listings from text prompts', icon: Sparkles, color: 'bg-blue-50 text-blue-600' },
    { id: 'attr', title: 'Attribute Extractor', desc: 'Extract physical materials, colors, and craft techniques from photos', icon: Tag, color: 'bg-amber-50 text-amber-600' },
    { id: 'category', title: 'Category Predictor', desc: 'Get accurate marketplace category suggestions', icon: FolderTree, color: 'bg-pink-50 text-pink-600' },
    { id: 'listing', title: 'Listing Optimizer', desc: 'Improve existing product listings with AI score', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
    { id: 'pricing', title: 'Pricing Assistant', desc: 'Get AI-based optimal pricing suggestions', icon: TrendingUp, color: 'bg-rose-50 text-rose-600' },
    { id: 'assistant', title: 'AI Assistant Chat', desc: 'Your smart business assistant for everyday questions', icon: MessageSquare, color: 'bg-teal-50 text-teal-600' },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md text-xs font-semibold px-3 py-1 rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" /> AI Studio v2.0 • Active Vision & Intelligence Engine
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Turn Product Photos into Structured Intelligence</h1>
          <p className="text-xs text-blue-100 max-w-xl leading-relaxed">
            Upload handicraft product images to extract grounded visual attributes, categories, and OCR text via authenticated Python Computer Vision.
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl text-center min-w-44">
          <span className="text-[11px] font-medium text-blue-100 block">AI Vision Engine</span>
          <span className="text-xl font-extrabold block">Gemini + PaddleOCR</span>
          <span className="text-[10px] text-emerald-300 font-bold block mt-1">✓ Authenticated Microservice</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-semibold text-slate-600">
        {['Overview', 'AI Vision Studio', 'AI Product Generator', 'AI Assistant'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === tab ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-100'
            }`}
          >
            {tab === 'AI Vision Studio' && <Camera className="w-3.5 h-3.5" />}
            {tab === 'AI Product Generator' && <Sparkles className="w-3.5 h-3.5" />}
            {tab === 'AI Assistant' && <MessageSquare className="w-3.5 h-3.5" />}
            <span>{tab}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Overview Tools Grid */}
      {activeTab === 'Overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {aiTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <div
                key={tool.id}
                onClick={() => {
                  if (tool.id === 'vision' || tool.id === 'attr' || tool.id === 'category') {
                    setActiveTab('AI Vision Studio');
                  } else if (tool.id === 'assistant') {
                    setActiveTab('AI Assistant');
                  } else {
                    setActiveTab('AI Product Generator');
                  }
                }}
                className="bg-white p-5 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all space-y-3"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tool.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-slate-900">{tool.title}</h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">{tool.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================================================== */}
      {/* Tab 2: PHASE 03.2 — AI VISION STUDIO (REAL PHOTO FLOW) */}
      {/* ==================================================== */}
      {activeTab === 'AI Vision Studio' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6 text-xs">
          {/* Workflow Header Steps */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-center border-b border-slate-100 pb-4 text-xs font-bold">
            <div className={`p-2.5 rounded-xl flex items-center justify-center gap-1.5 ${visionStep === 1 ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
              <Upload className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">1. Upload & Pre-flight</span>
            </div>
            <div className={`p-2.5 rounded-xl flex items-center justify-center gap-1.5 ${visionStep === 2 ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
              <Eye className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">2. Evidence & Corrections</span>
            </div>
            <div className={`p-2.5 rounded-xl flex items-center justify-center gap-1.5 ${visionStep === 3 ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
              <Sparkles className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">3. Grounded Listing Draft</span>
            </div>
            <div className={`p-2.5 rounded-xl flex items-center justify-center gap-1.5 ${visionStep === 4 ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">4. Master Product Created</span>
            </div>
          </div>

          {visionError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-2 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{visionError}</span>
            </div>
          )}

          {/* STEP 1: Upload & Pre-flight Image Inspection */}
          {visionStep === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Drag and Drop Upload Card */}
                <div className="space-y-3">
                  <label className="block font-bold text-sm text-slate-900">
                    Product Image File <span className="text-red-500">*</span>
                  </label>

                  {/* Hidden File Input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileValidateAndSelect(file);
                    }}
                  />

                  {!visionPreview ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleFileValidateAndSelect(file);
                      }}
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[220px] ${
                        isDragging
                          ? 'border-blue-600 bg-blue-50/50 scale-[1.01]'
                          : 'border-slate-300 bg-slate-50 hover:border-blue-500 hover:bg-slate-100/50'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="font-bold text-slate-800 text-sm">Drag & drop product photo or click to browse</p>
                      <p className="text-[11px] text-slate-400 mt-1">Supports JPEG, PNG, or WebP up to 10 MB</p>
                      <span className="mt-3 text-[10px] bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-semibold">
                        Browser Boundary • In-Memory Streaming
                      </span>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
                        <img
                          src={visionPreview}
                          alt="Product Preview"
                          className="max-h-full max-w-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-full shadow-md transition-colors"
                          title="Remove image"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <div>
                          <span className="font-bold text-slate-800 block truncate max-w-[220px]">
                            {visionFile?.name}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {(visionFile?.size / 1024).toFixed(1)} KB • {visionFile?.type}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs text-blue-600 font-bold hover:underline"
                        >
                          Replace Photo
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Pre-flight Options & Context */}
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
                    Analysis Parameters
                  </h3>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Seller Context / Hint <span className="text-slate-400 font-normal">(Optional, max 500 chars)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={visionUserHint}
                      onChange={(e) => setVisionUserHint(e.target.value)}
                      maxLength={500}
                      placeholder="e.g. Handcrafted brass statue from Bastar, Chhattisgarh with lost-wax casting."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                    <span className="text-[10px] text-slate-400 block text-right mt-0.5">
                      {visionUserHint.length} / 500 characters
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visionEnableOcr}
                        onChange={(e) => setVisionEnableOcr(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <div>
                        <span className="font-bold text-slate-800 text-xs block">Enable PaddleOCR Text Recognition</span>
                        <span className="text-[11px] text-slate-500 block">
                          Extract visible labels, brand stamps, dimensions, and craft seals from the image.
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1 text-slate-700">
                    <div className="flex items-center gap-1.5 font-bold text-blue-900 text-xs">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span>Security & Tenant Scoping</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Image bytes are securely streamed in-memory to the Python microservice with internal HMAC authorization. No temporary files are written to disk.
                    </p>
                  </div>
                </div>
              </div>

              {/* Upload Progress Bar */}
              {isAnalyzingVision && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                      Streaming image & extracting vision intelligence...
                    </span>
                    <span>{visionProgress > 0 ? `${visionProgress}%` : 'Processing'}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(visionProgress, 20)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleAnalyzePhoto}
                  disabled={!visionFile || isAnalyzingVision}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isAnalyzingVision ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Extracting Vision Intelligence...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 text-amber-300" />
                      <span>Analyze Product Photo (POST /api/ai/analyze-image)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Review & Edit Validated Vision Intelligence */}
          {visionStep === 2 && (
            <div className="space-y-6">
              {/* Review Header & Reset */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-4 rounded-xl">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Vision Intelligence Extraction Complete</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Review and edit grounded observations below. Inferences are flagged with uncertainty badges.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVisionStep(1);
                    setVisionToken(null);
                    setVisionTokenExpiry(null);
                    setVisionError(null);
                  }}
                  className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-100 text-xs transition-colors"
                >
                  ← Upload Another Photo
                </button>
              </div>

              {/* Ambiguity Warning Banner */}
              {(visionMultipleProducts || visionUncertainties.length > 0) && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Visual Ambiguity & Uncertainty Review Required</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800">
                    {visionMultipleProducts && (
                      <li className="font-semibold">
                        Multiple products detected in frame. Please verify the primary product category and attributes.
                      </li>
                    )}
                    {visionUncertainties.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Token Expiry Warning Banner */}
              {isVisionTokenExpired && (
                <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-xs text-rose-800">
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span>Vision Provenance Token Expired</span>
                  </div>
                  <p className="text-[11px] text-rose-700">
                    The short-lived cryptographic vision contract expired at{' '}
                    {new Date(visionTokenExpiry).toLocaleTimeString()}. Please re-analyze the image to establish a valid cryptographic contract before generating a listing.
                  </p>
                </div>
              )}

              {/* Two-Column Review Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Image Thumbnail & Technical Specs */}
                <div className="space-y-4">
                  {visionPreview && (
                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                      <span className="font-bold text-xs text-slate-700 block">Uploaded Photo</span>
                      <div className="aspect-square rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
                        <img
                          src={visionPreview}
                          alt="Product"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {visionImageMeta && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                      <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                        Image Metadata
                      </h4>
                      <div className="space-y-1 text-[11px] text-slate-600">
                        <div className="flex justify-between">
                          <span>Dimensions:</span>
                          <span className="font-mono font-bold text-slate-800">
                            {visionImageMeta.width} × {visionImageMeta.height} px
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Aspect Ratio:</span>
                          <span className="font-mono font-bold text-slate-800">
                            {visionImageMeta.aspect_ratio}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Format:</span>
                          <span className="font-mono font-bold text-slate-800 uppercase">
                            {visionImageMeta.format}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>File Size:</span>
                          <span className="font-mono font-bold text-slate-800">
                            {(visionImageMeta.size_bytes / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Channels:</span>
                          <span className="font-mono font-bold text-slate-800">
                            {visionImageMeta.channels} (RGB)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {visionProcessingMeta && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                      <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                        Processing Diagnostics
                      </h4>
                      <div className="space-y-1 text-[11px] text-slate-600">
                        <div className="flex justify-between">
                          <span>Model Engine:</span>
                          <span className="font-bold text-indigo-600">
                            {visionProcessingMeta.model_name || visionProcessingMeta.vision_provider || 'multimodal'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Duration:</span>
                          <span className="font-mono font-bold text-slate-800">
                            {visionProcessingMeta.execution_time_ms ? `${visionProcessingMeta.execution_time_ms.toFixed(0)} ms` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Editable Vision Results */}
                <div className="lg:col-span-2 space-y-5">
                  {/* Product Type & Visual Description */}
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-white">
                    <h4 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
                      Identified Product Type & Visual Description
                    </h4>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Product Type (Editable)</label>
                      <input
                        type="text"
                        value={visionProductType}
                        onChange={(e) => setVisionProductType(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Objective Visual Description (Editable)</label>
                      <textarea
                        rows={3}
                        value={visionVisualDescription}
                        onChange={(e) => setVisionVisualDescription(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Category Suggestion Card */}
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        <FolderTree className="w-4 h-4 text-pink-600" />
                        <span>Category Prediction</span>
                      </h4>
                      <div className="flex items-center gap-2">
                        {renderConfidenceBadge(visionCategory.confidence)}
                        {renderUncertaintyPill(visionCategory.uncertainty_status)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Primary Category</label>
                        <input
                          type="text"
                          value={visionCategory.primary_category}
                          onChange={(e) =>
                            setVisionCategory({ ...visionCategory, primary_category: e.target.value })
                          }
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Subcategory</label>
                        <input
                          type="text"
                          value={visionCategory.subcategory}
                          onChange={(e) =>
                            setVisionCategory({ ...visionCategory, subcategory: e.target.value })
                          }
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                        />
                      </div>
                    </div>

                    {visionCategory.reasoning && (
                      <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <strong>Reasoning:</strong> {visionCategory.reasoning}
                      </p>
                    )}

                    {visionCategory.alternative_categories?.length > 0 && (
                      <div className="text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-600">Alternative matches: </span>
                        {visionCategory.alternative_categories.join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Extracted Attributes List */}
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        <Tag className="w-4 h-4 text-amber-600" />
                        <span>Extracted Product Attributes ({visionAttributes.length})</span>
                      </h4>
                      <span className="text-[10px] text-slate-400">Values are fully editable</span>
                    </div>

                    {visionAttributes.length === 0 ? (
                      <p className="text-slate-400 text-xs py-2">No specific attributes extracted.</p>
                    ) : (
                      <div className="space-y-3">
                        {visionAttributes.map((attr, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-xs font-mono text-slate-700 uppercase">
                                {attr.name.replace(/_/g, ' ')}
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {renderConfidenceBadge(attr.confidence)}
                                {renderUncertaintyPill(attr.uncertainty_status)}
                                {renderEvidenceSourcePill(attr.evidence_source)}
                              </div>
                            </div>

                            <input
                              type="text"
                              value={attr.value}
                              onChange={(e) => handleUpdateAttributeValue(idx, e.target.value)}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900"
                            />

                            {attr.notes && (
                              <p className="text-[10px] text-slate-500 italic">
                                Note: {attr.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* OCR Text Recognition Results */}
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <h4 className="font-bold text-sm text-slate-900">
                          OCR Text Recognition (PaddleOCR)
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        status: {visionOcr.status} ({visionOcr.segment_count} segments)
                      </span>
                    </div>

                    {visionOcr.extracted_text ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <textarea
                            readOnly
                            rows={3}
                            value={visionOcr.extracted_text}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800"
                          />
                          <button
                            type="button"
                            onClick={handleCopyOcrText}
                            className="absolute top-2 right-2 px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedOcr ? 'Copied!' : 'Copy Text'}</span>
                          </button>
                        </div>

                        {visionOcr.segments?.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-500 block">Detected Text Segments:</span>
                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                              {visionOcr.segments.map((seg, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-700 font-mono"
                                  title={`Confidence: ${(seg.confidence * 100).toFixed(0)}%`}
                                >
                                  <span>{seg.text}</span>
                                  <span className="text-slate-400">({(seg.confidence * 100).toFixed(0)}%)</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-400 text-xs py-2 italic">
                        No printed text, brand label, or engraved mark detected in this product photo.
                      </p>
                    )}
                  </div>

                  {/* Focal Product Disambiguation (if multiple items detected) */}
                  {visionMultipleProducts && (
                    <div className="p-4 border-2 border-amber-300 bg-amber-50 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 text-amber-900 font-bold">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span>Focal Product Selection (Required)</span>
                      </div>
                      <p className="text-[11px] text-amber-800">
                        The vision engine detected multiple products in this photograph. Specify which item is the primary focal product to anchor the listing generation.
                      </p>
                      <input
                        type="text"
                        placeholder="e.g. Center brass peacock diya, front ceramic mug, wooden bowl on left"
                        value={focalProductSelection}
                        onChange={(e) => setFocalProductSelection(e.target.value)}
                        className="w-full p-2.5 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Seller Context & Grounding Additions */}
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-white">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                      <Tag className="w-4 h-4 text-blue-600" />
                      <h4 className="font-bold text-sm text-slate-900">
                        Seller Context & Preferred Details (Optional)
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-[11px] text-slate-700 mb-1">
                          Preferred Title
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Handcrafted Kashmiri Walnut Wood Bowl"
                          value={preferredTitle}
                          onChange={(e) => setPreferredTitle(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-[11px] text-slate-700 mb-1">
                          Preferred Brand
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Bhartiye Crafts"
                          value={preferredBrand}
                          onChange={(e) => setPreferredBrand(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-[11px] text-slate-700 mb-1">
                        Additional Craft / Artisan Details
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Add artisan background, heritage craft origin, wood seasoning, or specific dimensions..."
                        value={sellerAdditionalDetails}
                        onChange={(e) => setSellerAdditionalDetails(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* AI Listing Generation Preferences */}
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-white">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                      <Sliders className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-sm text-slate-900">
                        AI Listing Generation Preferences
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-bold text-[11px] text-slate-700 mb-1">
                          Listing Tone
                        </label>
                        <select
                          value={listingTone}
                          onChange={(e) => setListingTone(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 bg-white"
                        >
                          <option value="artisan">Artisanal & Cultural</option>
                          <option value="professional">Formal & Professional</option>
                          <option value="conversational">Conversational & Engaging</option>
                          <option value="luxurious">Luxurious & Premium</option>
                          <option value="minimalist">Minimalist & Direct</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-[11px] text-slate-700 mb-1">
                          Marketplace Style
                        </label>
                        <select
                          value={listingMarketplaceFocus}
                          onChange={(e) => setListingMarketplaceFocus(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 bg-white"
                        >
                          <option value="general">Marketplace Neutral</option>
                          <option value="amazon">Amazon India Focus</option>
                          <option value="flipkart">Flipkart Focus</option>
                          <option value="meesho">Meesho Value Focus</option>
                          <option value="myntra">Myntra Fashion Focus</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-[11px] text-slate-700 mb-1">
                          Target Audience
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Home decor lovers, festive shoppers"
                          value={listingTargetAudience}
                          onChange={(e) => setListingTargetAudience(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="pt-1">
                      <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={listingIncludeStylingTips}
                          onChange={(e) => setListingIncludeStylingTips(e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                        />
                        <span>Include care, maintenance, and styling tips in product story</span>
                      </label>
                    </div>
                  </div>

                  {/* Generation Footer & Trigger */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    {isVisionTokenExpired && (
                      <div className="p-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-xs font-medium flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span>
                          Vision session token has expired (15-minute TTL). Please upload or re-analyze the image to establish a valid cryptographic session.
                        </span>
                      </div>
                    )}

                    {listingError && (
                      <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-lg text-xs font-medium flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        <span>{listingError}</span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-[11px] text-slate-500">
                        <span>Phase 03.3.4 • Orchestrates grounded listing generation from verified vision tokens.</span>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => setVisionStep(1)}
                          className="px-3.5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors"
                        >
                          New Photo
                        </button>
                        <button
                          type="button"
                          onClick={handleGenerateListingDraft}
                          disabled={
                            isGeneratingListing ||
                            isVisionTokenExpired ||
                            (visionMultipleProducts && !focalProductSelection.trim())
                          }
                          className="flex-1 sm:flex-initial px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isGeneratingListing ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin text-white" />
                              <span>Generating Grounded Draft...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 text-amber-300" />
                              <span>Generate Grounded AI Listing Draft →</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* STEP 3: GROUNDED AI LISTING DRAFT REVIEW & EDIT       */}
          {/* ==================================================== */}
          {visionStep === 3 && (
            <div className="space-y-6">
              {/* Draft Status & Provenance Banner */}
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-sm text-blue-900">
                      Grounded AI Listing Draft Generated
                    </h3>
                    {listingIsFallback ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        Fallback Generator Used
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Provider: {listingAiProvider.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-blue-700">
                    Draft is grounded in cryptographically verified visual evidence and seller inputs. Review, adjust, and approve before persisting to catalog.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVisionStep(2)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                  >
                    ← Back to Evidence
                  </button>
                </div>
              </div>

              {/* Error banner if persistence or edit fails */}
              {listingError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-2 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>{listingError}</span>
                </div>
              )}

              {/* Validation Warnings or Confirmation Required Alert */}
              {(listingConfirmationFields.length > 0 || listingValidationWarnings.length > 0) && (
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-800 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Attention: Fields Requiring Seller Confirmation or Warnings</span>
                  </div>
                  {listingConfirmationFields.length > 0 && (
                    <div className="text-amber-700">
                      <span className="font-semibold">Confirm with physical product: </span>
                      {listingConfirmationFields.join(', ')}
                    </div>
                  )}
                  {listingValidationWarnings.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1 text-amber-700 text-[11px]">
                      {listingValidationWarnings.map((warn, wIdx) => (
                        <li key={wIdx}>{warn}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Cols: Main Content Review & Editing */}
                <div className="lg:col-span-2 space-y-5">
                  {/* Title & Descriptions Card */}
                  <div className="p-5 border border-slate-200 rounded-xl space-y-4 bg-white shadow-sm">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block font-bold text-xs text-slate-800">
                          Listing Title <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {listingTitle.length} chars (aim for 50-150)
                        </span>
                      </div>
                      <input
                        type="text"
                        value={listingTitle}
                        onChange={(e) => setListingTitle(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-xs text-slate-800 mb-1">
                        Short Description / Highlight
                      </label>
                      <textarea
                        rows={2}
                        value={listingShortDesc}
                        onChange={(e) => setListingShortDesc(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-xs text-slate-800 mb-1">
                        Full Product Story & Description
                      </label>
                      <textarea
                        rows={6}
                        value={listingDesc}
                        onChange={(e) => setListingDesc(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                      <div>
                        <label className="block font-bold text-[11px] text-slate-600 mb-1">Product Type</label>
                        <input
                          type="text"
                          value={listingProductType}
                          onChange={(e) => setListingProductType(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-[11px] text-slate-600 mb-1">Primary Category</label>
                        <input
                          type="text"
                          value={listingCategoryPrimary}
                          onChange={(e) => setListingCategoryPrimary(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-[11px] text-slate-600 mb-1">Subcategory</label>
                        <input
                          type="text"
                          value={listingCategorySub}
                          onChange={(e) => setListingCategorySub(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bullet Points Card */}
                  <div className="p-5 border border-slate-200 rounded-xl space-y-3 bg-white shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <h4 className="font-bold text-xs text-slate-800">
                          Key Bullet Points ({listingBulletPoints.length}/6)
                        </h4>
                      </div>
                      {listingBulletPoints.length < 6 && (
                        <button
                          type="button"
                          onClick={handleAddBulletPoint}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Point
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {listingBulletPoints.map((bp, bpIdx) => (
                        <div key={bpIdx} className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px] mt-2 flex-shrink-0">
                            {bpIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={bp}
                            onChange={(e) => handleUpdateBulletPoint(bpIdx, e.target.value)}
                            className="flex-1 p-2 border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-blue-500"
                          />
                          {listingBulletPoints.length > 3 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveBulletPoint(bpIdx)}
                              className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                              title="Remove bullet point"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Grounded Attributes Card */}
                  <div className="p-5 border border-slate-200 rounded-xl space-y-3 bg-white shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-indigo-600" />
                        <h4 className="font-bold text-xs text-slate-800">
                          Grounded Product Attributes ({listingAttributes.length})
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        Mapped to catalog attributes on approval
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {listingAttributes.map((attr, aIdx) => (
                        <div
                          key={aIdx}
                          className="p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span className="font-bold text-xs font-mono text-slate-700 uppercase">
                              {attr.name.replace(/_/g, ' ')}
                            </span>
                            {renderListingProvenanceBadge(attr.provenance, attr.requires_confirmation)}
                          </div>
                          <input
                            type="text"
                            value={attr.value || ''}
                            onChange={(e) => handleUpdateDraftAttribute(aIdx, 'value', e.target.value)}
                            className="w-full p-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Search Keywords Card */}
                  <div className="p-5 border border-slate-200 rounded-xl space-y-3 bg-white shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FolderTree className="w-4 h-4 text-purple-600" />
                        <h4 className="font-bold text-xs text-slate-800">
                          Search Keywords ({listingKeywords.length})
                        </h4>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {listingKeywords.map((kw, kwIdx) => (
                        <span
                          key={kwIdx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs font-medium"
                        >
                          <span>{kw}</span>
                          {listingKeywords.length > 3 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveKeyword(kw)}
                              className="text-purple-400 hover:text-red-500 rounded-full"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    <form onSubmit={handleAddKeyword} className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Add new keyword tag..."
                        value={newKeywordInput}
                        onChange={(e) => setNewKeywordInput(e.target.value)}
                        className="flex-1 p-2 border border-slate-200 rounded-lg text-xs"
                      />
                      <button
                        type="submit"
                        className="px-3 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700"
                      >
                        Add Tag
                      </button>
                    </form>
                  </div>
                </div>

                {/* Right 1 Col: Photo Thumbnail, SEO Snippet & Master Product Catalog Save */}
                <div className="space-y-5">
                  {/* Photo Preview & Grounding Source */}
                  <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
                    <span className="font-bold text-xs text-slate-700 block">Verified Source Photo</span>
                    {visionPreview && (
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
                        <img src={visionPreview} alt="Product Source" className="max-h-full max-w-full object-contain" />
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 space-y-1">
                      <div>Brand: <strong className="text-slate-700">{listingBrand}</strong></div>
                      <div>Engine: <strong className="text-slate-700">{draftMetadata?.ai_provider || listingAiProvider}</strong></div>
                      <div>Grounding Confidence: <strong className="text-emerald-600">{draftMetadata?.provenance_reconciliation?.reconciliation_stats?.grounded_attributes ?? 'Verified'} grounded</strong></div>
                    </div>
                  </div>

                  {/* SEO Metadata Snippet Card */}
                  <div className="p-4 border border-slate-200 rounded-xl bg-white shadow-sm space-y-2">
                    <span className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-blue-600" /> Search Snippet (SEO)
                    </span>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
                      <p className="text-blue-700 text-xs font-medium truncate hover:underline cursor-pointer">
                        {listingSeo?.meta_title || listingTitle}
                      </p>
                      <p className="text-[10px] text-emerald-700 truncate font-mono">
                        https://bhartiyecrafts.com/products/{listingSeo?.slug || 'handcrafted-item'}
                      </p>
                      <p className="text-[11px] text-slate-600 line-clamp-2">
                        {listingSeo?.meta_description || listingShortDesc || listingDesc}
                      </p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        URL Slug (SEO)
                      </label>
                      <input
                        type="text"
                        value={listingSeo?.slug || ''}
                        onChange={(e) =>
                          setListingSeo((prev) => ({
                            ...prev,
                            slug: e.target.value.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-'),
                          }))
                        }
                        placeholder="e.g. jaipur-blue-pottery-vase"
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-700"
                      />
                    </div>
                  </div>

                  {/* Master Product Catalog Persistence Card */}
                  <div className="p-5 border-2 border-emerald-500/40 bg-emerald-50/30 rounded-2xl space-y-4 shadow-sm">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-emerald-600" />
                        <h4 className="font-bold text-sm text-slate-900">Create Master Product</h4>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Final seller review. Approving saves this listing into your MongoDB Product catalog.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block font-bold text-[11px] text-slate-700 mb-1">
                          Product SKU <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={listingSku}
                          onChange={(e) => setListingSku(e.target.value.toUpperCase())}
                          placeholder="e.g. BC-WOD-001"
                          className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 uppercase"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block font-bold text-[11px] text-slate-700 mb-1">
                            Master Price (₹) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={listingPrice}
                            onChange={(e) => setListingPrice(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-[11px] text-slate-700 mb-1">
                            Cost Price (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={listingCostPrice}
                            onChange={(e) => setListingCostPrice(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-[11px] text-slate-700 mb-1">
                            Stock
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={listingStock}
                            onChange={(e) => setListingStock(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                          />
                        </div>
                      </div>

                      {uploadedImageUrl ? (
                        <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 flex items-center justify-between">
                          <span className="flex items-center gap-1 font-medium truncate">
                            <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            Photo uploaded & cached
                          </span>
                          <span className="text-[10px] text-emerald-600 font-mono truncate max-w-[130px]">{uploadedImageUrl}</span>
                        </div>
                      ) : (
                        <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span>Photo will be uploaded to storage upon approval</span>
                        </div>
                      )}

                      <div className="p-2.5 bg-white border border-emerald-200 rounded-lg text-[10px] text-emerald-800 space-y-0.5">
                        <span className="font-bold block">✓ Catalog Persistence Rules:</span>
                        <span>• Grounded attributes map directly to Product attribute Map</span>
                        <br />
                        <span>• Permanent photo URL stored in images[0]</span>
                        <br />
                        <span>• Multi-marketplace publishing disabled until Phase 03.5</span>
                      </div>

                      <button
                        type="button"
                        onClick={handleApproveAndCreateMasterProduct}
                        disabled={isSavingMasterProduct || isUploadingImage || !listingSku.trim() || !listingPrice}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isUploadingImage ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Uploading Product Photo...</span>
                          </>
                        ) : isSavingMasterProduct ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Persisting Master Product in Catalog...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Seller Approves → Create Master Product</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* STEP 4: MASTER PRODUCT CREATED CONFIRMATION          */}
          {/* ==================================================== */}
          {visionStep === 4 && (
            <div className="p-8 border border-emerald-200 bg-emerald-50/50 rounded-2xl text-center space-y-5 max-w-xl mx-auto shadow-sm">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <Check className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-extrabold text-slate-900">
                  Master Product Successfully Created!
                </h3>
                <p className="text-xs text-slate-600">
                  Your grounded AI listing draft has been approved and permanently saved into the catalog.
                </p>
              </div>

              <div className="p-4 bg-white border border-emerald-200 rounded-xl text-left space-y-2 text-xs">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Product Title:</span>
                  <span className="font-bold text-slate-900 truncate max-w-xs">{listingTitle}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">SKU:</span>
                  <span className="font-mono font-bold text-slate-900">{listingSku}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Master Price:</span>
                  <span className="font-bold text-emerald-600">₹{listingPrice}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Category:</span>
                  <span className="font-medium text-slate-800">{listingCategoryPrimary || 'Fashion'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2 items-center">
                  <span className="text-slate-500">Persistent Photo:</span>
                  <span className="font-mono text-emerald-700 text-[11px] truncate max-w-xs">
                    {masterProductSuccess?.images?.[0] || uploadedImageUrl || 'Saved'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Catalog ID:</span>
                  <span className="font-mono text-slate-600 text-[11px] truncate max-w-xs">
                    {masterProductSuccess?._id || masterProductSuccess?.id || 'Persisted in MongoDB'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <Link
                  to="/products"
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <Package className="w-4 h-4" />
                  <span>View in Product Catalog</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    handleRemoveFile();
                    setGeneratedDraft(null);
                    setDraftMetadata(null);
                    setMasterProductSuccess(null);
                    setVisionStep(1);
                  }}
                  className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  Create Another Listing
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* Tab 3: LEGACY AI PRODUCT GENERATOR (TEXT FLOW)       */}
      {/* ==================================================== */}
      {activeTab === 'AI Product Generator' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6 text-xs">
          {/* Process Workflow Steps Bar */}
          <div className="grid grid-cols-3 gap-3 text-center border-b border-slate-100 pb-4 text-xs font-bold">
            <div className={`p-2.5 rounded-xl ${genStep === 1 ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
              1. Basic Info → POST /api/ai/generate-product
            </div>
            <div className={`p-2.5 rounded-xl ${genStep === 2 ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
              2. AI Review & Edit Structured Data
            </div>
            <div className={`p-2.5 rounded-xl ${genStep === 3 ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
              3. Seller Approves → Master Product Created in MongoDB
            </div>
          </div>

          {genError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-2 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{genError}</span>
            </div>
          )}

          {/* STEP 1: Input & Image Upload */}
          {genStep === 1 && (
            <form onSubmit={handleGenerateAI} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-slate-900">Upload Product Image</h3>
                  <div
                    onClick={() => setActiveTab('AI Vision Studio')}
                    className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 space-y-2 cursor-pointer hover:border-blue-500 transition-colors"
                  >
                    <Camera className="w-8 h-8 text-blue-500 mx-auto" />
                    <p className="font-bold text-slate-800">Switch to AI Vision Studio for real image analysis</p>
                    <p className="text-[11px] text-slate-400">Extracts categories, visual attributes, and OCR with confidence scoring.</p>
                    <span className="inline-block mt-2 text-xs font-bold text-blue-600 underline">
                      Open AI Vision Studio →
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-bold text-sm text-slate-900">Basic Product Information</h3>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Product Description / Hint *</label>
                    <input
                      type="text"
                      value={promptInput}
                      onChange={(e) => setPromptInput(e.target.value)}
                      placeholder="e.g. Handcrafted Cotton Kurta with Floral Print"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Category</label>
                      <select
                        value={categoryInput}
                        onChange={(e) => setCategoryInput(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      >
                        <option value="Fashion">Fashion</option>
                        <option value="Handicrafts">Handicrafts</option>
                        <option value="Home & Kitchen">Home & Kitchen</option>
                        <option value="Electronics">Electronics</option>
                        <option value="Footwear">Footwear</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Brand</label>
                      <input
                        type="text"
                        value={brandInput}
                        onChange={(e) => setBrandInput(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Material</label>
                      <input
                        type="text"
                        value={materialInput}
                        onChange={(e) => setMaterialInput(e.target.value)}
                        placeholder="Pure Cotton"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Color</label>
                      <input
                        type="text"
                        value={colorInput}
                        onChange={(e) => setColorInput(e.target.value)}
                        placeholder="Indigo Blue"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">SKU *</label>
                      <input
                        type="text"
                        value={skuInput}
                        onChange={(e) => setSkuInput(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Master Price (₹) *</label>
                      <input
                        type="number"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Stock</label>
                      <input
                        type="number"
                        value={stockInput}
                        onChange={(e) => setStockInput(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md flex items-center gap-2 disabled:opacity-70 cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Calling Backend AI Service (POST /api/ai/generate-product)...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Generate Structured Product Draft with AI</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: AI Review & Edit Structured Product Data */}
          {genStep === 2 && (
            <div className="space-y-6">
              <div className={`p-4 rounded-xl flex items-center justify-between border ${
                draftIsFallback
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}>
                <div className="flex items-center gap-2 font-bold">
                  <Sparkles className={`w-5 h-5 ${draftIsFallback ? 'text-amber-600' : 'text-emerald-600'}`} />
                  <div>
                    <span>{draftIsFallback ? 'Structured Fallback Draft Generated' : 'Real AI Product Draft Generated'}</span>
                    <span className="text-[10px] block font-normal text-slate-600">
                      {draftIsFallback
                        ? 'Notice: AI Provider Key not configured or API call failed; fallback e-commerce template applied.'
                        : `Generated using active backend AI model (${draftAiProvider.toUpperCase()}).`}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setGenStep(1)}
                  className="text-xs font-semibold hover:underline flex-shrink-0"
                >
                  ← Edit Prompt / Regenerate
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">Review & Edit Generated Details</h3>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Product Title</label>
                    <input
                      type="text"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Short Summary Highlight</label>
                    <textarea
                      rows={2}
                      value={draftShortDesc}
                      onChange={(e) => setDraftShortDesc(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Full Description & Specifications</label>
                    <textarea
                      rows={5}
                      value={draftDesc}
                      onChange={(e) => setDraftDesc(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Material</label>
                      <input
                        type="text"
                        value={draftMaterial}
                        onChange={(e) => setDraftMaterial(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Color</label>
                      <input
                        type="text"
                        value={draftColor}
                        onChange={(e) => setDraftColor(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h3 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">Master Product Metadata</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Category:</span>
                      <span className="font-bold text-slate-800">{draftCategory}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Brand:</span>
                      <span className="font-bold text-slate-800">{draftBrand}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Master Price:</span>
                      <span className="font-bold text-emerald-600">₹{priceInput}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">SKU:</span>
                      <span className="font-mono font-bold text-slate-800">{skuInput}</span>
                    </div>
                  </div>

                  {draftKeywords.length > 0 && (
                    <div className="pt-2">
                      <span className="font-bold text-slate-700 block mb-1">AI Keywords:</span>
                      <div className="flex flex-wrap gap-1">
                        {draftKeywords.map((kw, i) => (
                          <span key={i} className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                            #{kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => setGenStep(1)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-medium"
                >
                  Back
                </button>
                <button
                  onClick={handleApproveAndCreate}
                  disabled={isCreatingProduct}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md flex items-center gap-2 disabled:opacity-70 cursor-pointer"
                >
                  {isCreatingProduct ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving to MongoDB (POST /api/products)...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Seller Approves → Create Master Product</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Master Product Created in MongoDB */}
          {genStep === 3 && createdProduct && (
            <div className="py-10 text-center space-y-4 max-w-lg mx-auto">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-xl font-extrabold text-slate-900">MASTER PRODUCT CREATED IN MONGODB</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                The AI-generated product <strong>"{createdProduct.title || draftTitle}"</strong> with SKU <strong>{createdProduct.sku || skuInput}</strong> has been saved to your tenant catalog in MongoDB.
              </p>
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-left space-y-1 text-xs font-mono">
                <div><span className="font-bold text-slate-500">Product ID:</span> {createdProduct._id || createdProduct.id}</div>
                <div><span className="font-bold text-slate-500">SKU:</span> {createdProduct.sku}</div>
                <div><span className="font-bold text-slate-500">Master Price:</span> ₹{createdProduct.masterPrice}</div>
                <div><span className="font-bold text-slate-500">Status:</span> Active</div>
              </div>
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  onClick={() => {
                    setGenStep(1);
                    setPromptInput('');
                    setCreatedProduct(null);
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 font-semibold"
                >
                  Generate Another Product
                </button>
                <Link
                  to="/products"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-lg text-xs flex items-center gap-1.5"
                >
                  <span>View in Master Product Catalog</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* Tab 4: AI ASSISTANT CHAT                              */}
      {/* ==================================================== */}
      {activeTab === 'AI Assistant' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col h-[500px] text-xs">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <span className="font-bold text-sm text-slate-900">AI Seller Assistant Chat</span>
            </div>
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Online</span>
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-md p-3 rounded-xl ${m.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-100 text-slate-800 rounded-bl-none'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 text-slate-500 p-3 rounded-xl flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Thinking...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSendChat} className="flex gap-2 border-t border-slate-100 pt-3">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask anything about your business..."
              className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
            <button type="submit" disabled={isChatLoading} className="bg-blue-600 text-white p-2.5 rounded-lg disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
