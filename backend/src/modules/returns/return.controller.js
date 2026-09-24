import { validateReturnInput, validateInspectionInput } from './return.validator.js';
import {
  createReturnService,
  getReturnsService,
  getReturnByIdService,
  inspectReturnItemService,
} from './return.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const createReturn = async (req, res) => {
  try {
    const { isValid, errors } = validateReturnInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'Return request validation failed', errors);
    }

    const returnDoc = await createReturnService(req.tenant, req.body);
    return successResponse(res, 201, 'Return RMA created successfully', { return: returnDoc });
  } catch (error) {
    console.error('Create Return Error:', error);
    return errorResponse(res, 400, error.message || 'Failed to create return request');
  }
};

export const getReturns = async (req, res) => {
  try {
    const result = await getReturnsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Returns fetched successfully', result);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch returns');
  }
};

export const getReturnById = async (req, res) => {
  try {
    const returnDoc = await getReturnByIdService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'Return details fetched successfully', { return: returnDoc });
  } catch (error) {
    return errorResponse(res, 404, error.message || 'Return record not found');
  }
};

export const inspectReturn = async (req, res) => {
  try {
    const { isValid, errors } = validateInspectionInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'Return inspection validation failed', errors);
    }

    const { id, itemId } = req.params;
    const updated = await inspectReturnItemService(req.tenant, id, itemId, req.body);

    return successResponse(res, 200, 'Return item inspected successfully', { return: updated });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to inspect return item');
  }
};
