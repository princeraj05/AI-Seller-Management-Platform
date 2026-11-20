import { getAiMicroserviceClient, AiMicroserviceError } from '../../services/aiMicroservice.client.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

/**
 * Controller: Analyzes an uploaded product image using the authenticated Python AI Microservice.
 *
 * Security & Scoping:
 * - Tenant identity is strictly resolved from authenticated session (req.tenant.sellerId).
 * - Client-supplied sellerId or storeId parameters are strictly ignored.
 * - Streams file data in-memory without disk persistence.
 * - Forwards validated buffer directly to getAiMicroserviceClient().extractProductAttributes().
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

    return successResponse(
      res,
      200,
      'Product image intelligence extracted successfully.',
      {
        vision: visionResult.data,
        request_id: visionResult.request_id,
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
