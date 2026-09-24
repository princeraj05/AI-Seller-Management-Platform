import { validatePOSCheckoutInput } from './pos.validator.js';
import { checkoutPOSService, getPOSBillsService, getPOSBillByIdService } from './pos.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const checkoutPOS = async (req, res) => {
  try {
    const { isValid, errors } = validatePOSCheckoutInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'POS Checkout validation failed', errors);
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || null;

    const bill = await checkoutPOSService(req.tenant, req.body, idempotencyKey);
    return successResponse(res, 201, 'POS sale completed successfully', { bill });
  } catch (error) {
    console.error('POS Checkout Error:', error);
    return errorResponse(res, 400, error.message || 'POS Checkout failed');
  }
};

export const getPOSBills = async (req, res) => {
  try {
    const result = await getPOSBillsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'POS bills fetched successfully', result);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch POS bills');
  }
};

export const getPOSBillById = async (req, res) => {
  try {
    const bill = await getPOSBillByIdService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'POS bill fetched successfully', { bill });
  } catch (error) {
    return errorResponse(res, 404, error.message || 'POS bill not found');
  }
};
