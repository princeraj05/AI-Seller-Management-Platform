import { validateProductInput } from './product.validator.js';
import {
  createProductService,
  getProductsService,
  getProductByIdService,
  updateProductService,
  deleteProductService,
} from './product.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const createProduct = async (req, res) => {
  try {
    const { isValid, errors } = validateProductInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'Product validation failed', errors);
    }

    const product = await createProductService(req.tenant, req.body);
    return successResponse(res, 201, 'Product created successfully', { product });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to create product');
  }
};

export const getProducts = async (req, res) => {
  try {
    const result = await getProductsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Products fetched successfully', result);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch products');
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await getProductByIdService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'Product fetched successfully', { product });
  } catch (error) {
    return errorResponse(res, 404, error.message || 'Product not found');
  }
};

export const updateProduct = async (req, res) => {
  try {
    const updated = await updateProductService(req.tenant.sellerId, req.params.id, req.body);
    return successResponse(res, 200, 'Product updated successfully', { product: updated });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to update product');
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const result = await deleteProductService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'Product deleted successfully', result);
  } catch (error) {
    return errorResponse(res, 404, error.message || 'Failed to delete product');
  }
};
