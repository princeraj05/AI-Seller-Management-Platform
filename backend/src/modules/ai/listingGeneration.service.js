/**
 * LLM Listing Generation Orchestration Service (Phase 03.3.3)
 *
 * Connects Phase 03.3.2 listing prompt & validation engine with Gemini and OpenAI APIs.
 *
 * Responsibilities:
 * 1. Input validation & strict tenant resolution.
 * 2. Cryptographic vision provenance verification & restart fallback handling.
 * 3. Multi-product ambiguity guarding (requires focal product selection).
 * 4. Effective attribute resolution.
 * 5. Structured prompt construction.
 * 6. Provider selection, invocation with AbortController timeouts, and bounded failover.
 * 7. Resilient JSON extraction and schema validation against MarketplaceNeutralListingSchema.
 * 8. Deterministic Provenance Reconciliation (overwrites LLM tags with server-verified data).
 * 9. Non-hallucinating grounded fallback engine (strictly zero ungrounded fabrications).
 * 10. AIJob audit lifecycle tracking.
 */

import { config } from '../../config/env.js';
import {
  validateListingInput,
  validateListingOutput,
} from './listingValidator.schema.js';
import {
  buildListingPrompt,
} from './listingPrompt.service.js';
import {
  verifyAndResolveVisionProvenance,
  VisionProvenanceError,
} from './visionProvenance.service.js';
import {
  resolveEffectiveAttributes,
} from './visionDataContract.schema.js';
import { AIJob } from './ai.model.js';

export class ListingOrchestrationError extends Error {
  constructor(message, code = 'LISTING_ORCHESTRATION_FAILED', statusCode = 500, details = null) {
    super(ListingOrchestrationError.sanitize(message));
    this.name = 'ListingOrchestrationError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details ? ListingOrchestrationError.sanitizeDetails(details) : null;
  }

  static sanitize(text) {
    if (!text || typeof text !== 'string') return text;
    let result = text;
    const openaiKey = config.ai?.openaiApiKey || process.env.OPENAI_API_KEY;
    const geminiKey = config.ai?.geminiApiKey || process.env.GEMINI_API_KEY;
    const rootSecret = config.jwt?.accessSecret;

    if (openaiKey && openaiKey.length >= 8 && result.includes(openaiKey)) {
      result = result.replaceAll(openaiKey, '[REDACTED_OPENAI_KEY]');
    }
    if (geminiKey && geminiKey.length >= 8 && result.includes(geminiKey)) {
      result = result.replaceAll(geminiKey, '[REDACTED_GEMINI_KEY]');
    }
    if (rootSecret && rootSecret.length >= 8 && result.includes(rootSecret)) {
      result = result.replaceAll(rootSecret, '[REDACTED_SECRET]');
    }

    // Redact OpenAI sk-... keys
    result = result.replace(/sk-[a-zA-Z0-9_-]{16,}/gi, '[REDACTED_OPENAI_KEY]');
    // Redact Bearer tokens
    result = result.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]');
    // Redact query parameter patterns like ?key=AIzaSy...
    result = result.replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED_API_KEY]');
    return result;
  }

  static sanitizeDetails(details) {
    try {
      const serialized = JSON.stringify(details);
      const sanitized = ListingOrchestrationError.sanitize(serialized);
      return JSON.parse(sanitized);
    } catch {
      return { note: 'Sanitized error details' };
    }
  }
}

/**
 * Global timeouts for generation orchestration
 */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 30000; // 30 seconds per provider
export const OVERALL_GENERATION_DEADLINE_MS = 45000; // 45 seconds total deadline

/**
 * Normalizes an attribute name for deterministic reconciliation.
 */
function normalizeAttrName(name) {
  return String(name || '').toLowerCase().trim().replace(/[_\s-]+/g, '_');
}

/**
 * Normalizes an attribute value for deterministic reconciliation comparison.
 * Collapses whitespace and lowercases string values.
 */
function normalizeAttrValue(val) {
  return String(val || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Reconciles candidate listing attributes against authentic server-verified effective attributes.
 *
 * Security & Provenance Invariants:
 * 1. The LLM is an untrusted generator and must NEVER be trusted to self-assign provenance.
 * 2. If attribute name and value match authentic server data:
 *    - Overwrite LLM tags with authentic evidence_source, uncertainty_status, and provenance.
 * 3. If attribute name matches but value was altered by LLM:
 *    - Mark as inferred, require seller confirmation, and add validation warning.
 * 4. If attribute was invented by LLM (unmatched):
 *    - Force evidence_source: 'inferred', uncertainty_status: 'reasonable_inference', provenance: 'vision_inference'.
 *    - Add attribute name to fields_requiring_seller_confirmation.
 *    - Add validation warning.
 * 5. If verified physical attributes were omitted by LLM:
 *    - Inject them into output to prevent data loss.
 * 6. Deduplicates attributes deterministically without conflicting duplicates.
 *
 * @param {object} candidateListing - Conforming MarketplaceNeutralListingSchema draft
 * @param {object} effectiveAttributes - Trusted effective attributes from resolveEffectiveAttributes
 * @returns {object} Reconciled listing draft passing validateListingOutput
 */
export function reconcileProvenance(candidateListing, effectiveAttributes) {
  const trustedAttrs = Array.isArray(effectiveAttributes?.attributes) ? effectiveAttributes.attributes : [];
  const trustedMap = new Map();

  for (const attr of trustedAttrs) {
    const normKey = normalizeAttrName(attr.name);
    if (!trustedMap.has(normKey)) {
      trustedMap.set(normKey, {
        name: attr.name,
        value: String(attr.value || '').trim(),
        evidence_source: attr.evidence_source || 'inferred',
        uncertainty_status: attr.uncertainty_status || 'uncertain',
        provenance: attr.provenance || 'vision_uncertain',
        notes: attr.notes || null,
      });
    }
  }

  const reconciledAttributes = [];
  const seenAttributeKeys = new Set();
  const confirmationSet = new Set(candidateListing.fields_requiring_seller_confirmation || []);
  const warnings = [...(candidateListing.validation_warnings || [])];

  const candidateAttributes = Array.isArray(candidateListing.attributes) ? candidateListing.attributes : [];

  for (const candAttr of candidateAttributes) {
    const normName = normalizeAttrName(candAttr.name);
    if (seenAttributeKeys.has(normName)) {
      // Skip conflicting duplicate attribute names
      continue;
    }
    seenAttributeKeys.add(normName);

    const trusted = trustedMap.get(normName);

    if (trusted) {
      const candNormVal = normalizeAttrValue(candAttr.value);
      const trustedNormVal = normalizeAttrValue(trusted.value);

      if (candNormVal === trustedNormVal) {
        // MATCH: Restore authentic server-verified provenance and authentic casing
        reconciledAttributes.push({
          name: trusted.name, // Preserve authentic casing
          value: trusted.value, // Preserve authentic trusted value
          evidence_source: trusted.evidence_source,
          uncertainty_status: trusted.uncertainty_status,
          provenance: trusted.provenance,
          notes: trusted.notes || candAttr.notes || null,
        });
      } else {
        // SAME NAME, DIFFERENT VALUE: LLM altered the value
        // Demote to reasonable inference; require seller confirmation
        reconciledAttributes.push({
          name: candAttr.name.trim(),
          value: candAttr.value.trim(),
          evidence_source: 'inferred',
          uncertainty_status: 'reasonable_inference',
          provenance: 'vision_inference',
          notes: candAttr.notes || `AI modified value from verified evidence ('${trusted.value}').`,
        });
        confirmationSet.add(candAttr.name.trim());
        warnings.push(`Attribute "${candAttr.name.trim()}" value ('${candAttr.value.trim()}') differs from verified evidence ('${trusted.value}') and requires seller confirmation.`);
      }
    } else {
      // UNMATCHED / INVENTED ATTRIBUTE: LLM introduced an attribute not present in trusted evidence
      reconciledAttributes.push({
        name: candAttr.name.trim(),
        value: candAttr.value.trim(),
        evidence_source: 'inferred',
        uncertainty_status: 'reasonable_inference',
        provenance: 'vision_inference',
        notes: candAttr.notes || 'Inferred by AI without verified evidence.',
      });
      confirmationSet.add(candAttr.name.trim());
      warnings.push(`Attribute "${candAttr.name.trim()}" was generated by AI without verified evidence and requires seller confirmation.`);
    }
  }

  // Preserve omitted verified physical attributes
  for (const [normKey, trusted] of trustedMap.entries()) {
    if (!seenAttributeKeys.has(normKey)) {
      // Only inject confirmed physical observations or explicit seller inputs
      if (trusted.uncertainty_status === 'confirmed_observation' || trusted.uncertainty_status === 'seller_provided') {
        reconciledAttributes.push({
          name: trusted.name,
          value: trusted.value,
          evidence_source: trusted.evidence_source,
          uncertainty_status: trusted.uncertainty_status,
          provenance: trusted.provenance,
          notes: trusted.notes || 'Preserved from verified evidence.',
        });
        seenAttributeKeys.add(normKey);
      }
    }
  }

  // Return reconciled copy
  const reconciled = {
    ...candidateListing,
    attributes: reconciledAttributes,
    fields_requiring_seller_confirmation: Array.from(confirmationSet),
    validation_warnings: Array.from(new Set(warnings)),
  };

  return validateListingOutput(reconciled);
}

/**
 * Builds a deterministic, non-hallucinating fallback listing draft
 * derived strictly from verified vision observations and seller declarations.
 *
 * Prohibits fabricating unverified materials, origins, handmade claims, or dimensions.
 *
 * @param {object} effectiveAttributes - Trusted effective attributes
 * @returns {object} Conforming MarketplaceNeutralListingSchema draft
 */
export function buildGroundedFallbackListing(effectiveAttributes) {
  if (!effectiveAttributes || typeof effectiveAttributes !== 'object') {
    throw new ListingOrchestrationError('Cannot generate fallback listing: effectiveAttributes is missing.', 'INSUFFICIENT_EVIDENCE', 422);
  }

  const effective = effectiveAttributes.effective_attributes || effectiveAttributes;
  const productType = effective.product_type?.value || '';
  const visualDesc = effective.visual_description || '';
  const categoryPrimary = effective.category?.primary_category || 'General';
  const categorySub = effective.category?.subcategory || 'Products';
  const sellerTitle = effective.title || '';
  const sellerBrand = effective.brand || null;
  const additionalDetails = effective.additional_details || '';

  if (!productType && !visualDesc && !sellerTitle) {
    throw new ListingOrchestrationError('Insufficient visual evidence to construct a grounded product listing.', 'INSUFFICIENT_EVIDENCE', 422);
  }

  // Construct grounded title (20-150 chars)
  let baseTitle = sellerTitle;
  if (!baseTitle) {
    const brandPrefix = sellerBrand ? `${sellerBrand} ` : '';
    baseTitle = `${brandPrefix}${productType || 'Product'}`;
  }
  let title = baseTitle.trim();
  if (title.length < 20) {
    title = `${title} - ${categoryPrimary} ${categorySub}`.trim();
  }
  if (title.length < 20) {
    title = `${title} Catalog Listing`.trim();
  }
  if (title.length > 150) {
    title = title.slice(0, 150).trim();
  }

  // Construct grounded short description (50-300 chars)
  let shortDesc = visualDesc.trim();
  if (!shortDesc || shortDesc.length < 50) {
    shortDesc = `Authentic ${productType || 'item'} in ${categoryPrimary} category. Visual intelligence verified from uploaded product photograph.`;
  }
  if (shortDesc.length > 300) {
    shortDesc = shortDesc.slice(0, 297).trim() + '...';
  }

  // Construct grounded description (100-3000 chars)
  const descParts = [];
  if (visualDesc) {
    descParts.push(`Product Overview:\n${visualDesc}`);
  }
  if (additionalDetails) {
    descParts.push(`Seller Specifications:\n${additionalDetails}`);
  }
  descParts.push(`Category: ${categoryPrimary} - ${categorySub}. Verified through AI Studio visual analysis.`);

  let description = descParts.join('\n\n').trim();
  if (description.length < 100) {
    description = `${description}\n\nPlease review and confirm all attributes before publishing to marketplaces.`;
  }
  if (description.length > 3000) {
    description = description.slice(0, 3000).trim();
  }

  // Construct grounded attributes (pure copy of trusted effective attributes)
  const rawAttributes = Array.isArray(effective.attributes) ? effective.attributes : [];
  const attributes = rawAttributes.map((attr) => ({
    name: String(attr.name).trim(),
    value: String(attr.value).trim(),
    evidence_source: attr.evidence_source,
    uncertainty_status: attr.uncertainty_status,
    provenance: attr.provenance,
    notes: attr.notes || null,
  }));

  // Construct grounded bullet points (3-6 items, 10-250 chars)
  const bulletPoints = [
    `Visual classification: ${productType || categorySub} in ${categoryPrimary}`,
    visualDesc.length >= 10 ? `Visual highlights: ${visualDesc.slice(0, 200)}` : `Designed for ${categoryPrimary} use cases`,
    `Verified through Bhartiye Crafts AI Studio visual inspection`,
  ];
  if (sellerBrand) {
    bulletPoints.push(`Brand specification: ${sellerBrand}`);
  }

  // Construct search keywords (3-25 items, 2-50 chars)
  const keywordSet = new Set();
  if (productType) keywordSet.add(productType.toLowerCase().slice(0, 50));
  if (categoryPrimary) keywordSet.add(categoryPrimary.toLowerCase().slice(0, 50));
  if (categorySub) keywordSet.add(categorySub.toLowerCase().slice(0, 50));
  if (sellerBrand) keywordSet.add(sellerBrand.toLowerCase().slice(0, 50));
  keywordSet.add('artisan catalog');
  keywordSet.add('verified listing');

  for (const attr of attributes) {
    if (attr.name && attr.value && keywordSet.size < 20) {
      keywordSet.add(`${attr.name} ${attr.value}`.toLowerCase().slice(0, 50));
    }
  }

  const searchKeywords = Array.from(keywordSet).slice(0, 25);

  // Construct SEO (meta_title 20-70, meta_description 50-160, slug 5-100)
  let metaTitle = title.slice(0, 70).trim();
  if (metaTitle.length < 20) metaTitle = `${metaTitle} - Buy Online`.slice(0, 70);

  let metaDesc = shortDesc.slice(0, 160).trim();
  if (metaDesc.length < 50) {
    metaDesc = `Discover ${title}. High quality product catalog listing verified by AI Studio.`.slice(0, 160);
  }

  let slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  if (slug.length < 5) slug = 'product-listing-draft';

  // Unknown fields requiring seller confirmation
  const confirmationFields = [];
  for (const attr of attributes) {
    if (attr.uncertainty_status === 'unknown' || attr.uncertainty_status === 'uncertain') {
      confirmationFields.push(attr.name);
    }
  }
  if (!attributes.some((a) => a.name.toLowerCase().includes('material'))) {
    confirmationFields.push('material_composition');
  }

  const fallbackListing = {
    title,
    short_description: shortDesc,
    description,
    product_type: productType.slice(0, 100) || 'Product',
    category: {
      primary_category: categoryPrimary.slice(0, 100),
      subcategory: categorySub.slice(0, 100),
    },
    brand: sellerBrand ? sellerBrand.slice(0, 100) : null,
    attributes,
    bullet_points: bulletPoints.slice(0, 6),
    search_keywords: searchKeywords,
    seo: {
      meta_title: metaTitle,
      meta_description: metaDesc,
      slug,
    },
    fields_requiring_seller_confirmation: Array.from(new Set(confirmationFields)),
    validation_warnings: ['Generated using deterministic grounded fallback due to unavailable AI provider.'],
  };

  return validateListingOutput(fallbackListing);
}

/**
 * Executes an HTTP POST request to OpenAI Chat Completions API with AbortController timeout.
 */
async function callOpenAiProvider({ promptData, apiKey, timeoutMs, model = 'gpt-4o-mini' }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: promptData.messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new ListingOrchestrationError(
        `OpenAI provider error: HTTP ${response.status} - ${errText}`,
        'OPENAI_API_ERROR',
        response.status >= 500 ? 502 : 400
      );
    }

    const resJson = await response.json();
    const rawContent = resJson.choices?.[0]?.message?.content;
    if (!rawContent || typeof rawContent !== 'string') {
      throw new ListingOrchestrationError('OpenAI returned empty message content.', 'OPENAI_EMPTY_RESPONSE', 502);
    }
    return rawContent;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ListingOrchestrationError(
        `OpenAI request timed out after ${timeoutMs}ms.`,
        'OPENAI_TIMEOUT',
        504
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Executes an HTTP POST request to Gemini GenerateContent API with AbortController timeout.
 */
async function callGeminiProvider({ promptData, apiKey, timeoutMs, model = 'gemini-1.5-flash' }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: promptData.systemInstruction }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: promptData.userPrompt }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new ListingOrchestrationError(
        `Gemini provider error: HTTP ${response.status} - ${errText}`,
        'GEMINI_API_ERROR',
        response.status >= 500 ? 502 : 400
      );
    }

    const resJson = await response.json();
    const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText || typeof candidateText !== 'string') {
      throw new ListingOrchestrationError('Gemini returned empty candidate content.', 'GEMINI_EMPTY_RESPONSE', 502);
    }
    return candidateText;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ListingOrchestrationError(
        `Gemini request timed out after ${timeoutMs}ms.`,
        'GEMINI_TIMEOUT',
        504
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extracts and parses JSON from raw model text response.
 */
function parseModelJsonResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new ListingOrchestrationError('Model output is empty or not a string.', 'INVALID_MODEL_OUTPUT', 502);
  }

  // 1. Direct parse attempt
  try {
    return JSON.parse(rawText.trim());
  } catch {
    // 2. Clean markdown code fences (```json ... ```)
    const cleaned = rawText
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // 3. Substring extraction from first '{' to last '}'
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
        } catch {
          // Fall through
        }
      }
    }
  }

  throw new ListingOrchestrationError(
    'Failed to parse valid JSON from AI provider response.',
    'MALFORMED_AI_JSON',
    502
  );
}

/**
 * Main Orchestration Function: Generates a validated, provenance-reconciled listing draft.
 *
 * @param {object} tenant - Authenticated tenant context { sellerId, storeId }
 * @param {object} requestBody - Untrusted client payload
 * @param {object} [options] - Optional overrides for testing (mockProviderFn, timeoutMs, deadlineMs)
 * @returns {Promise<object>} { listing, metadata }
 */
export async function orchestrateListingGeneration(tenant, requestBody, options = {}) {
  const startTime = Date.now();
  const overallDeadline = startTime + (options.deadlineMs || OVERALL_GENERATION_DEADLINE_MS);

  // 1. Tenant Verification
  const sellerId = tenant?.sellerId;
  const storeId = tenant?.storeId || null;
  if (!sellerId) {
    throw new ListingOrchestrationError(
      'Tenant identity unresolved. Authentication required.',
      'UNAUTHORIZED_TENANT',
      401
    );
  }

  // 2. Input Validation
  const validatedInput = validateListingInput(requestBody);

  // 3. Vision Provenance Verification
  const resolvedProvenance = verifyAndResolveVisionProvenance({
    visionToken: validatedInput.vision_token,
    sellerId,
    storeId,
    clientVisionData: validatedInput.client_vision_data,
  });

  // 4. Resolve Effective Attributes & Multi-Product Guard
  const effectiveResult = resolveEffectiveAttributes(
    resolvedProvenance.visionData,
    validatedInput.seller_corrections
  );

  if (effectiveResult.multiple_products_status?.requires_focal_selection) {
    throw new ListingOrchestrationError(
      'Multiple products detected in photo. Please provide focal_product_selection in seller_corrections before generating listing.',
      'FOCAL_PRODUCT_SELECTION_REQUIRED',
      400
    );
  }

  // 5. Construct Structured Prompt
  const promptData = buildListingPrompt({
    effectiveAttributes: effectiveResult.effective_attributes,
    preferences: validatedInput.preferences,
  });

  // 6. AIJob Tracking Initialized (status: processing)
  let aiJobRecord = null;
  const safeInputMetadata = {
    has_seller_corrections: Boolean(validatedInput.seller_corrections),
    preferences: validatedInput.preferences || null,
    result_id: resolvedProvenance.resultId,
  };

  try {
    aiJobRecord = await AIJob.create({
      sellerId,
      storeId,
      type: 'product_generator',
      status: 'processing',
      input: safeInputMetadata,
    });
  } catch (dbErr) {
    console.warn('AIJob audit log creation failed (non-fatal):', dbErr.message);
  }

  // 7. Determine Provider Sequence
  const openaiKey = config.ai?.openaiApiKey || process.env.OPENAI_API_KEY;
  const geminiKey = config.ai?.geminiApiKey || process.env.GEMINI_API_KEY;
  const preferredProvider = (process.env.AI_PROVIDER || 'openai').toLowerCase().trim();

  const providerPlan = [];
  if (preferredProvider === 'gemini') {
    if (geminiKey) providerPlan.push('gemini');
    if (openaiKey) providerPlan.push('openai');
  } else {
    if (openaiKey) providerPlan.push('openai');
    if (geminiKey) providerPlan.push('gemini');
  }

  let finalListing = null;
  let usedProvider = null;
  let isFallback = false;
  let providerErrors = [];

  // Testing Hook: Allows automated test suite to inject deterministic mock provider responses
  if (typeof options.mockProviderFn === 'function') {
    try {
      const mockResult = await options.mockProviderFn({ promptData, providerPlan });
      if (mockResult && mockResult.rawText) {
        const parsed = parseModelJsonResponse(mockResult.rawText);
        const validatedOutput = validateListingOutput(parsed);
        finalListing = reconcileProvenance(validatedOutput, effectiveResult.effective_attributes);
        usedProvider = mockResult.provider || 'mock';
      }
    } catch (mockErr) {
      providerErrors.push(mockErr.message);
    }
  } else {
    // Real Provider Execution Loop (Max 2 attempts respecting deadline)
    for (let attempt = 0; attempt < providerPlan.length; attempt++) {
      const currentProvider = providerPlan[attempt];
      const remainingDeadline = overallDeadline - Date.now();
      if (remainingDeadline <= 2000) {
        providerErrors.push('Overall generation deadline exceeded.');
        break;
      }

      const providerTimeout = Math.min(
        options.timeoutMs || DEFAULT_PROVIDER_TIMEOUT_MS,
        remainingDeadline - 500
      );

      try {
        let rawOutputText = null;
        if (typeof options.mockProviderCall === 'function') {
          rawOutputText = await options.mockProviderCall(currentProvider, {
            promptData,
            providerTimeout,
            remainingDeadline,
            attempt,
          });
        } else if (currentProvider === 'openai') {
          rawOutputText = await callOpenAiProvider({
            promptData,
            apiKey: openaiKey,
            timeoutMs: providerTimeout,
          });
        } else if (currentProvider === 'gemini') {
          rawOutputText = await callGeminiProvider({
            promptData,
            apiKey: geminiKey,
            timeoutMs: providerTimeout,
          });
        }

        if (rawOutputText) {
          const parsedJson = parseModelJsonResponse(rawOutputText);
          const validatedJson = validateListingOutput(parsedJson);

          // 8. Deterministic Provenance Reconciliation
          finalListing = reconcileProvenance(validatedJson, effectiveResult.effective_attributes);
          usedProvider = currentProvider;
          break; // Success! Exit provider loop
        }
      } catch (err) {
        providerErrors.push(`${currentProvider}: ${err.message}`);
        // Continue to secondary provider if available
      }
    }
  }

  // 9. Fallback Handling if all providers failed or no API keys configured
  if (!finalListing) {
    if (options.disableFallback) {
      if (aiJobRecord) {
        try {
          await AIJob.findByIdAndUpdate(aiJobRecord._id, {
            status: 'failed',
            error: ListingOrchestrationError.sanitize(providerErrors.join(' | ') || 'All providers failed and fallback disabled'),
            completedAt: new Date(),
          });
        } catch (dbErr) {
          console.warn('AIJob audit update failed:', dbErr.message);
        }
      }
      throw new ListingOrchestrationError(
        `Listing generation failed: ${providerErrors.join('; ') || 'Provider failed and fallback disabled'}`,
        'LISTING_GENERATION_FAILED',
        502
      );
    }

    try {
      const fallbackDraft = buildGroundedFallbackListing(effectiveResult.effective_attributes);
      finalListing = reconcileProvenance(fallbackDraft, effectiveResult.effective_attributes);
      usedProvider = 'fallback';
      isFallback = true;
    } catch (fallbackErr) {
      // AIJob status: failed
      if (aiJobRecord) {
        try {
          await AIJob.findByIdAndUpdate(aiJobRecord._id, {
            status: 'failed',
            error: ListingOrchestrationError.sanitize(providerErrors.join(' | ') || fallbackErr.message),
            completedAt: new Date(),
          });
        } catch (dbErr) {
          console.warn('AIJob audit update failed:', dbErr.message);
        }
      }
      throw new ListingOrchestrationError(
        `Listing generation failed: ${providerErrors.join('; ') || fallbackErr.message}`,
        'LISTING_GENERATION_FAILED',
        502
      );
    }
  }

  // 10. Update AIJob status: completed
  const serverMetadata = {
    generated_at: new Date().toISOString(),
    ai_provider: usedProvider,
    is_fallback: isFallback,
    vision_grounded: true,
    result_id: resolvedProvenance.resultId,
  };

  if (aiJobRecord) {
    try {
      await AIJob.findByIdAndUpdate(aiJobRecord._id, {
        status: 'completed',
        output: {
          title: finalListing.title,
          category: finalListing.category,
          metadata: serverMetadata,
        },
        completedAt: new Date(),
      });
    } catch (dbErr) {
      console.warn('AIJob audit update failed:', dbErr.message);
    }
  }

  return {
    listing: finalListing,
    metadata: serverMetadata,
  };
}
