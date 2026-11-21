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
} from 'lucide-react';
import { generateProductAIApi, analyzeProductImageApi } from '../../services/aiService';
import { createProductApi } from '../../services/productService';
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
    setVisionToken(null);
    setVisionTokenExpiry(null);
  };

  const handleRemoveFile = () => {
    if (visionPreview) {
      URL.revokeObjectURL(visionPreview);
    }
    setVisionFile(null);
    setVisionPreview(null);
    setVisionError(null);
    setVisionProgress(0);
    setVisionToken(null);
    setVisionTokenExpiry(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAnalyzePhoto = async (e) => {
    e?.preventDefault();
    setVisionError(null);
    setVisionToken(null);
    setVisionTokenExpiry(null);

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
          <div className="grid grid-cols-2 gap-3 text-center border-b border-slate-100 pb-4 text-xs font-bold">
            <div className={`p-2.5 rounded-xl flex items-center justify-center gap-2 ${visionStep === 1 ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
              <Upload className="w-4 h-4" />
              <span>1. Upload Product Photo & Pre-flight</span>
            </div>
            <div className={`p-2.5 rounded-xl flex items-center justify-center gap-2 ${visionStep === 2 ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
              <Eye className="w-4 h-4" />
              <span>2. Review & Edit Vision Intelligence</span>
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

                  {/* Scoping Notice */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-center justify-between">
                    <span>
                      <strong>Phase 03.2 Scope:</strong> Vision extraction and review only. Product catalog persistence and marketplace publishing will be enabled in subsequent integration phases.
                    </span>
                    <button
                      type="button"
                      onClick={() => setVisionStep(1)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                    >
                      New Photo
                    </button>
                  </div>
                </div>
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
