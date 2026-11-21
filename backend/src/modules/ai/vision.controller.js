import { getAiMicroserviceClient, AiMicroserviceError } from '../../services/aiMicroservice.client.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';
import {
  createVisionProvenanceToken,
  verifyAndResolveVisionProvenance,
  VisionProvenanceError,
} from './visionProvenance.service.js';
import { resolveEffectiveAttributes } from './visionDataContract.schema.js';

/**
 * Controller: Analyzes an uploaded product image using the authenticated Python AI Microservice.
 *
 * Security & Scoping:
 * - Tenant identity is strictly resolved from authenticated session (req.tenant.sellerId).
 * - Client-supplied sellerId or storeId parameters are strictly ignored.
 * - Streams file data in-memory without disk persistence.
 * - Forwards validated buffer directly to getAiMicroserviceClient().extractProductAttributes().
 * - Issues a cryptographically signed, tenant-bound provenance token and stores result in bounded memory.
 * - Returns pure vision intelligence result without persisting Product documents or hallucinating SEO/marketplaces.
 *
 * @route POST /api/ai/analyze-image
 */
export const analyzeProductImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return errorResponse(
        res,
        400,
        'No product image file uploaded. An image is required.',
        'NO_IMAGE_PROVIDED',
        'NO_IMAGE_PROVIDED'
      );
    }

    const sellerId = req.tenant?.sellerId;
    if (!sellerId) {
      return errorResponse(
        res,
        401,
        'Tenant identity unresolved. Authentication required.',
        'UNAUTHORIZED_TENANT',
        'UNAUTHORIZED_TENANT'
      );
    }

    const storeId = req.tenant?.storeId || undefined;
    const client = getAiMicroserviceClient();

    const enableOcr = req.body?.enable_ocr !== 'false' && req.body?.enable_ocr !== false;
    const userHint = req.body?.user_hint || undefined;
    const requestId = req.headers['x-request-id'] || undefined;

    const visionResult = await client.extractProductAttributes({
      imageBuffer: req.file.buffer,
      filename: req.file.originalname || 'upload.jpg',
      mimeType: req.file.mimetype || 'image/jpeg',
      sellerId,
      storeId,
      requestId,
      enableOcr,
      userHint,
    });

    const provenance = createVisionProvenanceToken({
      visionData: visionResult.data,
      sellerId,
      storeId,
    });

    return successResponse(
      res,
      200,
      'Product image intelligence extracted successfully.',
      {
        vision: visionResult.data,
        vision_token: provenance.visionToken,
        request_id: visionResult.request_id,
        expires_at: provenance.expiresAt,
      }
    );
  } catch (err) {
    if (err instanceof AiMicroserviceError) {
      return errorResponse(
        res,
        err.statusCode || 500,
        err.message,
        err.code,
        err.code
      );
    }

    return errorResponse(
      res,
      500,
      `Internal image analysis error: ${err.message}`,
      'AI_VISION_ANALYSIS_FAILED',
      'AI_VISION_ANALYSIS_FAILED'
    );
  }
};

/**
 * Controller: Validates vision provenance token and resolves effective attributes
 * combined with seller corrections for listing generation readiness.
 *
 * Security & Scoping:
 * - Strictly tenant-isolated via req.tenant.sellerId and req.tenant.storeId.
 * - Cryptographically verifies token signature, expiry, and tenant binding.
 * - Rejects tampered payloads or cross-tenant tokens.
 * - Evaluates multi-product focal item disambiguation.
 * - Does NOT create Product records or trigger external LLM listing generation.
 *
 * @route POST /api/ai/validate-contract
 */
export const validateVisionContract = async (req, res) => {
  try {
    const sellerId = req.tenant?.sellerId;
    if (!sellerId) {
      return errorResponse(
        res,
        401,
        'Tenant identity unresolved. Authentication required.',
        'UNAUTHORIZED_TENANT',
        'UNAUTHORIZED_TENANT'
      );
    }
    const storeId = req.tenant?.storeId || undefined;

    const { vision_token, seller_corrections, client_vision_data } = req.body || {};

    const resolvedProvenance = verifyAndResolveVisionProvenance({
      visionToken: vision_token,
      sellerId,
      storeId,
      clientVisionData: client_vision_data,
    });

    const effectiveResult = resolveEffectiveAttributes(
      resolvedProvenance.visionData,
      seller_corrections
    );

    return successResponse(
      res,
      200,
      'Vision contract validated and effective attributes resolved successfully.',
      {
        result_id: resolvedProvenance.resultId,
        seller_id: resolvedProvenance.sellerId,
        store_id: resolvedProvenance.storeId,
        ...effectiveResult,
      }
    );
  } catch (err) {
    if (err instanceof VisionProvenanceError) {
      return errorResponse(
        res,
        err.statusCode || 400,
        err.message,
        err.code,
        err.code
      );
    }
    if (err.name === 'ZodError') {
      return errorResponse(
        res,
        400,
        `Validation failed: ${err.message}`,
        'VALIDATION_ERROR',
        'VALIDATION_ERROR'
      );
    }
    return errorResponse(
      res,
      500,
      `Internal contract validation error: ${err.message}`,
      'VISION_CONTRACT_VALIDATION_FAILED',
      'VISION_CONTRACT_VALIDATION_FAILED'
    );
  }
};
