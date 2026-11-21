/**
 * Controller: Marketplace-Neutral AI Product Listing Generation (Phase 03.3.3)
 *
 * Exposes: POST /api/ai/generate-listing
 *
 * Security & Scoping:
 * - Strictly tenant-bound through req.tenant.sellerId and req.tenant.storeId.
 * - Client-supplied tenant parameters are completely ignored.
 * - Verifies cryptographic vision token and tenant binding.
 * - Enforces multi-product focal point disambiguation.
 * - Invokes LLM provider with bounded timeouts and failover.
 * - Performs server-side deterministic provenance reconciliation.
 * - Does NOT create Product database records or publish to marketplaces.
 */

import {
  orchestrateListingGeneration,
  ListingOrchestrationError,
} from './listingGeneration.service.js';
import { VisionProvenanceError } from './visionProvenance.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const generateListingDraft = async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant || !tenant.sellerId) {
      return errorResponse(
        res,
        401,
        'Tenant identity unresolved. Authentication required.',
        'UNAUTHORIZED_TENANT',
        'UNAUTHORIZED_TENANT'
      );
    }

    const result = await orchestrateListingGeneration(tenant, req.body);
    const isFallback = result.metadata?.is_fallback || false;
    const message = isFallback
      ? 'Product listing draft generated using grounded fallback template (AI provider unavailable or failed).'
      : 'Product listing draft generated successfully with AI.';

    return successResponse(res, 200, message, {
      draft: result.listing,
      metadata: result.metadata,
      isFallback,
      aiProvider: result.metadata?.ai_provider || 'unknown',
    });
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

    if (err instanceof ListingOrchestrationError) {
      return errorResponse(
        res,
        err.statusCode || 500,
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
      `Internal listing generation error: ${err.message}`,
      'LISTING_GENERATION_FAILED',
      'LISTING_GENERATION_FAILED'
    );
  }
};
