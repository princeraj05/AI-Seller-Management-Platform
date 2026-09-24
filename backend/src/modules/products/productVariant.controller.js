import { validateVariantInput } from './productVariant.validator.js';
import {
  createVariantService,
  getVariantsService,
  updateVariantService,
  deleteVariantService,
} from './productVariant.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const createVariant = async (req, res) => {
  try {
    const { isValid, errors } = validateVariantInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'Variant validation failed', errors);
    }

    const variant = await createVariantService(req.tenant, req.params.productId, req.body);
    return successResponse(res, 201, 'Variant created successfully', { variant });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to create variant');
  }
};

export const getVariants = async (req, res) => {
  try {
    const variants = await getVariantsService(req.tenant.sellerId, req.params.productId);
    return successResponse(res, 200, 'Variants fetched successfully', { variants });
  } catch (error) {
    return errorResponse(res, 404, error.message || 'Failed to fetch variants');
  }
};

export const updateVariant = async (req, res) => {
  try {
    const variant = await updateVariantService(
      req.tenant.sellerId,
      req.params.productId,
      req.params.variantId,
      req.body
    );
    return successResponse(res, 200, 'Variant updated successfully', { variant });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to update variant');
  }
};

export const deleteVariant = async (req, res) => {
  try {
    const result = await deleteVariantService(
      req.tenant.sellerId,
      req.params.productId,
      req.params.variantId
    );
    return successResponse(res, 200, 'Variant deleted successfully', result);
  } catch (error) {
    return errorResponse(res, 404, error.message || 'Failed to delete variant');
  }
};
