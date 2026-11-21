import { z } from 'zod';
import {
  SellerCorrectionsSchema,
  ProductIntelligenceResultSchema,
  EffectiveEvidenceSourceEnum,
  EffectiveUncertaintyStatusEnum,
  EffectiveProvenanceEnum,
} from './visionDataContract.schema.js';

/**
 * Optional seller preferences for tone, audience, and marketplace styling.
 */
export const ListingPreferencesSchema = z.object({
  target_audience: z.string().trim().max(200).optional(),
  tone: z.enum(['professional', 'conversational', 'luxurious', 'artisan', 'minimalist']).optional(),
  include_styling_tips: z.boolean().optional(),
  marketplace_focus: z.enum(['general', 'amazon', 'flipkart', 'meesho', 'myntra']).optional(),
}).strict();

/**
 * Strict Input Schema for Listing Generation.
 *
 * Security & Provenance Invariants:
 * 1. Requires a valid cryptographic vision_token issued by Phase 03.3.1.
 * 2. Rejects any client-supplied sellerId or storeId to preserve backend tenant isolation.
 * 3. Does not accept arbitrary client-submitted vision evidence as trusted evidence;
 *    client_vision_data is only accepted for the existing cryptographic digest restart fallback.
 * 4. Seller corrections are strictly bounded and validated via SellerCorrectionsSchema.
 * 5. Rejects any unrecognized root properties via .strict().
 */
export const GenerateListingInputSchema = z.object({
  vision_token: z.string().trim().min(1, 'vision_token is required').max(4096, 'vision_token exceeds maximum length'),
  seller_corrections: SellerCorrectionsSchema.optional().nullable(),
  client_vision_data: ProductIntelligenceResultSchema.optional().nullable(),
  preferences: ListingPreferencesSchema.optional().nullable(),
}).strict();

/**
 * Strict Schema for Individual Attributes in the Generated Listing.
 * Preserves evidence_source, uncertainty_status, and provenance from verified inputs.
 */
export const ListingAttributeOutputSchema = z.object({
  name: z.string().trim().min(1, 'Attribute name must not be empty').max(100, 'Attribute name exceeds 100 characters'),
  value: z.string().trim().min(1, 'Attribute value must not be empty').max(500, 'Attribute value exceeds 500 characters'),
  evidence_source: EffectiveEvidenceSourceEnum,
  uncertainty_status: EffectiveUncertaintyStatusEnum,
  provenance: EffectiveProvenanceEnum,
  notes: z.string().max(500).nullable().optional(),
}).strict();

/**
 * Strict Marketplace-Neutral Output Schema.
 *
 * Governs the LLM's structured JSON output for an e-commerce product draft.
 * - Enforces realistic character and count bounds suitable for Amazon, Flipkart, Meesho, etc.
 * - Does not require unsupported attributes merely to satisfy minimum array counts.
 * - Excludes backend metadata (e.g., generated_at, ai_provider, is_fallback) which must be added server-side.
 * - Uses .strict() on root and all nested objects to reject unrecognized or hallucinated keys.
 */
export const MarketplaceNeutralListingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(20, 'Product title must be at least 20 characters')
    .max(150, 'Product title must not exceed 150 characters'),
  short_description: z
    .string()
    .trim()
    .min(50, 'Short description must be at least 50 characters')
    .max(300, 'Short description must not exceed 300 characters'),
  description: z
    .string()
    .trim()
    .min(100, 'Comprehensive description must be at least 100 characters')
    .max(3000, 'Comprehensive description must not exceed 3000 characters'),
  product_type: z
    .string()
    .trim()
    .min(2, 'Product type must be at least 2 characters')
    .max(100, 'Product type must not exceed 100 characters'),
  category: z.object({
    primary_category: z.string().trim().min(2).max(100),
    subcategory: z.string().trim().min(2).max(100),
  }).strict(),
  brand: z.string().trim().max(100).nullable().default(null),
  attributes: z.array(ListingAttributeOutputSchema).max(50).default([]),
  bullet_points: z
    .array(z.string().trim().min(10, 'Bullet point must be at least 10 characters').max(250, 'Bullet point exceeds 250 characters'))
    .min(3, 'At least 3 bullet points are required')
    .max(6, 'Maximum 6 bullet points allowed'),
  search_keywords: z
    .array(z.string().trim().min(2, 'Keyword must be at least 2 characters').max(50, 'Keyword exceeds 50 characters'))
    .min(3, 'At least 3 search keywords are required')
    .max(25, 'Maximum 25 search keywords allowed'),
  seo: z.object({
    meta_title: z.string().trim().min(20, 'SEO title must be at least 20 characters').max(70, 'SEO title must not exceed 70 characters'),
    meta_description: z.string().trim().min(50, 'SEO description must be at least 50 characters').max(160, 'SEO description must not exceed 160 characters'),
    slug: z.string().trim().min(5, 'SEO slug must be at least 5 characters').max(100, 'SEO slug must not exceed 100 characters'),
  }).strict(),
  fields_requiring_seller_confirmation: z
    .array(z.string().trim().max(100))
    .max(20)
    .default([]),
  validation_warnings: z
    .array(z.string().trim().max(300))
    .max(20)
    .default([]),
}).strict();

/**
 * Validates untrusted request payload against GenerateListingInputSchema.
 *
 * @param {unknown} data - Raw request body
 * @returns {z.infer<typeof GenerateListingInputSchema>}
 */
export function validateListingInput(data) {
  return GenerateListingInputSchema.parse(data);
}

/**
 * Validates parsed LLM JSON response against MarketplaceNeutralListingSchema.
 *
 * @param {unknown} rawJson - Parsed JSON candidate from AI model
 * @returns {z.infer<typeof MarketplaceNeutralListingSchema>}
 */
export function validateListingOutput(rawJson) {
  return MarketplaceNeutralListingSchema.parse(rawJson);
}
