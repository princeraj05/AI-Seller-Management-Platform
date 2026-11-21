import { z } from 'zod';
import {
  ProductIntelligenceResultSchema,
  ExtractedAttributeSchema,
  CategoryPredictionSchema,
  UncertaintyStatusEnum,
  EvidenceSourceEnum,
} from '../../services/aiMicroservice.schema.js';

/**
 * Zod Schema for Seller Corrections and Overrides.
 * Captures explicit seller domain inputs without corrupting original computer vision observations.
 */
export const SellerCorrectionsSchema = z.object({
  preferred_title: z.string().trim().max(300).optional(),
  preferred_brand: z.string().trim().max(100).optional(),
  corrected_product_type: z.string().trim().max(300).optional(),
  corrected_material: z.string().trim().max(100).optional(),
  corrected_color: z.string().trim().max(100).optional(),
  corrected_category: z.object({
    primary_category: z.string().trim().max(200).optional(),
    subcategory: z.string().trim().max(200).optional(),
  }).strict().optional(),
  additional_details: z.string().trim().max(2000).optional(),
  attribute_overrides: z
    .record(z.string().trim().min(1).max(100), z.string().trim().max(500))
    .refine((obj) => Object.keys(obj).length <= 50, {
      message: 'Maximum 50 attribute overrides allowed',
    })
    .optional(),
  focal_product_selection: z.string().trim().max(500).optional(),
}).strict();

/**
 * Enums strictly distinguishing effective listing provenance.
 * Separates machine-observed evidence from seller-supplied claims.
 */
export const EffectiveEvidenceSourceEnum = z.enum([
  'vision_model',
  'ocr',
  'image_processing',
  'combined',
  'inferred',
  'seller_input',
]);

export const EffectiveUncertaintyStatusEnum = z.enum([
  'confirmed_observation',
  'reasonable_inference',
  'uncertain',
  'unknown',
  'seller_provided',
]);

export const EffectiveProvenanceEnum = z.enum([
  'vision_observation',
  'vision_inference',
  'vision_uncertain',
  'vision_unknown',
  'vision_prediction',
  'seller_provided',
]);

export const EffectiveAttributeSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.string().max(500),
  confidence: z.number().min(0).max(1).nullable(),
  evidence_source: EffectiveEvidenceSourceEnum,
  uncertainty_status: EffectiveUncertaintyStatusEnum,
  provenance: EffectiveProvenanceEnum,
  notes: z.string().max(500).nullable().optional(),
}).strict();

/**
 * Deep clone an object to guarantee immutability
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Resolves effective product attributes for downstream listing generation
 * by combining immutable vision output with validated seller corrections.
 *
 * Precedence & Provenance Rules:
 * 1. Explicit seller correction takes precedence for downstream listing generation.
 * 2. Seller-provided information MUST use evidence_source: 'seller_input',
 *    uncertainty_status: 'seller_provided', and provenance: 'seller_provided'.
 *    It is NEVER falsely labeled as an independently confirmed visual observation.
 * 3. Verified vision observations (confirmed_observation) are preserved when not corrected.
 * 4. Reasonable inferences (reasonable_inference) remain qualified as inferences and are NEVER promoted.
 * 5. Uncertain/unknown values remain uncertain/unknown unless corrected by seller.
 * 6. If multiple_products_detected === true, requires a non-empty focal_product_selection.
 * 7. Original vision result remains completely unmodified (frozen copy).
 *
 * @param {object} rawVision - Validated ProductIntelligenceResult
 * @param {object} [rawCorrections] - Seller corrections (optional)
 * @returns {object} { original_vision, seller_corrections, effective_attributes, multiple_products_status }
 */
export function resolveEffectiveAttributes(rawVision, rawCorrections = null) {
  // 1. Strict schema validation of original vision result
  const validatedVision = ProductIntelligenceResultSchema.parse(rawVision);
  const originalVisionCopy = Object.freeze(deepClone(validatedVision));

  // 2. Schema validation of seller corrections (if provided)
  let validatedCorrections = null;
  if (rawCorrections && Object.keys(rawCorrections).length > 0) {
    validatedCorrections = SellerCorrectionsSchema.parse(rawCorrections);
  }

  // 3. Multi-product focal selection guard
  const isMultiple = Boolean(validatedVision.multiple_products_detected);
  const focalSelection = validatedCorrections?.focal_product_selection?.trim() || null;
  const multipleProductsResolved = !isMultiple || Boolean(focalSelection);

  // 4. Resolve effective fields
  const isProductTypeCorrected = Boolean(validatedCorrections?.corrected_product_type);
  const isCategoryCorrected = Boolean(
    validatedCorrections?.corrected_category?.primary_category ||
    validatedCorrections?.corrected_category?.subcategory
  );

  const effective = {
    title: validatedCorrections?.preferred_title || null,
    brand: validatedCorrections?.preferred_brand || null,
    product_type: {
      value: isProductTypeCorrected
        ? validatedCorrections.corrected_product_type
        : validatedVision.product_type,
      evidence_source: isProductTypeCorrected ? 'seller_input' : 'vision_model',
      uncertainty_status: isProductTypeCorrected ? 'seller_provided' : 'reasonable_inference',
      provenance: isProductTypeCorrected ? 'seller_provided' : 'vision_inference',
    },
    category: {
      primary_category: validatedCorrections?.corrected_category?.primary_category || validatedVision.category.primary_category,
      subcategory: validatedCorrections?.corrected_category?.subcategory || validatedVision.category.subcategory,
      confidence: isCategoryCorrected ? null : validatedVision.category.confidence,
      uncertainty_status: isCategoryCorrected ? 'seller_provided' : validatedVision.category.uncertainty_status,
      evidence_source: isCategoryCorrected ? 'seller_input' : 'vision_model',
      provenance: isCategoryCorrected ? 'seller_provided' : 'vision_prediction',
    },
    attributes: [],
    additional_details: validatedCorrections?.additional_details || null,
    visual_description: validatedVision.visual_description,
    ocr_text: validatedVision.ocr?.extracted_text || '',
  };

  // Build mapped attributes from original vision
  const attrMap = new Map();
  for (const attr of validatedVision.attributes) {
    let provenance = 'vision_observation';
    if (attr.uncertainty_status === 'reasonable_inference') provenance = 'vision_inference';
    else if (attr.uncertainty_status === 'uncertain') provenance = 'vision_uncertain';
    else if (attr.uncertainty_status === 'unknown') provenance = 'vision_unknown';

    attrMap.set(attr.name.toLowerCase(), {
      name: attr.name,
      value: attr.value,
      confidence: attr.confidence,
      evidence_source: attr.evidence_source,
      uncertainty_status: attr.uncertainty_status,
      provenance,
      notes: attr.notes || null,
    });
  }

  // Apply explicit material correction
  if (validatedCorrections?.corrected_material) {
    attrMap.set('material', {
      name: 'material',
      value: validatedCorrections.corrected_material,
      confidence: null,
      evidence_source: 'seller_input',
      uncertainty_status: 'seller_provided',
      provenance: 'seller_provided',
      notes: 'Explicit seller-provided material specification.',
    });
  }

  // Apply explicit color correction
  if (validatedCorrections?.corrected_color) {
    attrMap.set('primary_color', {
      name: 'primary_color',
      value: validatedCorrections.corrected_color,
      confidence: null,
      evidence_source: 'seller_input',
      uncertainty_status: 'seller_provided',
      provenance: 'seller_provided',
      notes: 'Explicit seller-provided color specification.',
    });
  }

  // Apply arbitrary attribute overrides
  if (validatedCorrections?.attribute_overrides) {
    for (const [key, val] of Object.entries(validatedCorrections.attribute_overrides)) {
      if (val !== undefined && val !== null && String(val).trim()) {
        attrMap.set(key.toLowerCase(), {
          name: key,
          value: String(val).trim(),
          confidence: null,
          evidence_source: 'seller_input',
          uncertainty_status: 'seller_provided',
          provenance: 'seller_provided',
          notes: 'Explicit seller-provided attribute override.',
        });
      }
    }
  }

  effective.attributes = Array.from(attrMap.values());

  return {
    original_vision: originalVisionCopy,
    seller_corrections: validatedCorrections,
    effective_attributes: effective,
    multiple_products_status: {
      detected: isMultiple,
      focal_selection: focalSelection,
      resolved: multipleProductsResolved,
      requires_focal_selection: isMultiple && !multipleProductsResolved,
    },
  };
}

export {
  ProductIntelligenceResultSchema,
  ExtractedAttributeSchema,
  CategoryPredictionSchema,
  UncertaintyStatusEnum,
  EvidenceSourceEnum,
};
