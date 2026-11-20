import { z } from 'zod';

/**
 * Zod Schemas for validating Python FastAPI AI Microservice responses.
 * Maps 1:1 to Pydantic models in AiModule/app/schemas/vision.py and common.py.
 */

export const ImageMetadataSchema = z.object({
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  format: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  aspect_ratio: z.number(),
  has_exif: z.boolean().default(false),
  channels: z.number().int().default(3),
}).strict();

export const ExtractedAttributeSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  evidence_source: z.string().min(1),
  uncertainty_status: z.string().min(1),
  notes: z.string().nullable().optional(),
}).strict();

export const OcrTextSegmentSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  bounding_box: z.array(z.array(z.number())).nullable().optional(),
}).strict();

export const OcrResultSchema = z.object({
  status: z.string().min(1),
  extracted_text: z.string().default(''),
  segments: z.array(OcrTextSegmentSchema).default([]),
  segment_count: z.number().int().default(0),
  engine: z.string().default('PaddleOCR'),
  execution_time_ms: z.number().default(0),
}).strict();

export const CategoryPredictionSchema = z.object({
  primary_category: z.string().min(1),
  subcategory: z.string().min(1),
  alternative_categories: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  uncertainty_status: z.string().min(1),
  reasoning: z.string().default(''),
}).strict();

export const ProductIntelligenceResultSchema = z.object({
  product_type: z.string().min(1),
  visual_description: z.string().min(1),
  multiple_products_detected: z.boolean().default(false),
  category: CategoryPredictionSchema,
  attributes: z.array(ExtractedAttributeSchema).default([]),
  ocr: OcrResultSchema,
  uncertainties: z.array(z.string()).default([]),
  image_metadata: ImageMetadataSchema,
  processing_metadata: z.record(z.any()).default({}),
}).strict();

export const BaseVisionResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: ProductIntelligenceResultSchema,
  request_id: z.string().optional().default('req-unknown'),
}).strict();

export const VisionStatusResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.record(z.any()),
  request_id: z.string().optional().default('req-unknown'),
});

/**
 * Validates raw JSON from Python microservice against BaseVisionResponseSchema.
 * Throws a formatted ZodError if validation fails.
 *
 * @param {unknown} rawJson - Raw parsed JSON response
 * @returns {z.infer<typeof BaseVisionResponseSchema>} Validated typed response
 */
export function validateProductIntelligenceResponse(rawJson) {
  return BaseVisionResponseSchema.parse(rawJson);
}

/**
 * Validates status response from /api/v1/vision/status.
 *
 * @param {unknown} rawJson - Raw parsed JSON response
 * @returns {z.infer<typeof VisionStatusResponseSchema>} Validated typed response
 */
export function validateVisionStatusResponse(rawJson) {
  return VisionStatusResponseSchema.parse(rawJson);
}
