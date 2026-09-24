import { validateOrderInput, validateOrderStatusInput } from './order.validator.js';
import {
  createOrderService,
  getOrdersService,
  getOrderByIdService,
  updateOrderStatusService,
} from './order.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const createOrder = async (req, res) => {
  try {
    const { isValid, errors } = validateOrderInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'Order validation failed', errors);
    }

    const order = await createOrderService(req.tenant, req.body);
    return successResponse(res, 201, 'Master order created successfully', { order });
  } catch (error) {
    console.error('Create Order Error:', error);
    return errorResponse(res, 400, error.message || 'Failed to create order');
  }
};

export const getOrders = async (req, res) => {
  try {
    const result = await getOrdersService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Orders fetched successfully', result);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch orders');
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await getOrderByIdService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'Order details fetched successfully', { order });
  } catch (error) {
    return errorResponse(res, 404, error.message || 'Order not found');
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { isValid, errors } = validateOrderStatusInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'Order status validation failed', errors);
    }

    const updated = await updateOrderStatusService(
      req.tenant.sellerId,
      req.params.id,
      req.body.status,
      req.body.note,
      req.user
    );

    return successResponse(res, 200, 'Order status updated successfully', { order: updated });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to update order status');
  }
};
