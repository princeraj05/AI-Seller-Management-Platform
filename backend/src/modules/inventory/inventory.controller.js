import { validateStockAdjustInput, validateReservationInput } from './inventory.validator.js';
import {
  getInventoryService,
  getInventoryLedgerService,
  adjustStockService,
  reserveStockService,
  releaseReservationService,
} from './inventory.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const getInventory = async (req, res) => {
  try {
    const result = await getInventoryService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Inventory fetched successfully', result);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch inventory');
  }
};

export const getInventoryLedger = async (req, res) => {
  try {
    const result = await getInventoryLedgerService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Inventory ledger fetched successfully', result);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch inventory ledger');
  }
};

export const adjustStock = async (req, res) => {
  try {
    const { isValid, errors } = validateStockAdjustInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'Stock adjustment validation failed', errors);
    }

    const inventory = await adjustStockService(req.tenant, req.body);
    return successResponse(res, 200, 'Stock adjusted successfully', { inventory });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to adjust stock');
  }
};

export const reserveStock = async (req, res) => {
  try {
    const { isValid, errors } = validateReservationInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'Reservation validation failed', errors);
    }

    const inventory = await reserveStockService(req.tenant, req.body);
    return successResponse(res, 200, 'Stock reserved successfully', { inventory });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to reserve stock');
  }
};

export const releaseReservation = async (req, res) => {
  try {
    const { isValid, errors } = validateReservationInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'Reservation release validation failed', errors);
    }

    const inventory = await releaseReservationService(req.tenant, req.body);
    return successResponse(res, 200, 'Stock reservation released successfully', { inventory });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to release stock reservation');
  }
};
