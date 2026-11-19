import { validateProductInput } from './product.validator.js';
import {
  createProductService,
  getProductsService,
  getProductByIdService,
  updateProductService,
  deleteProductService,
} from './product.service.js';
import { uploadImageToCloudinary } from '../../config/cloudinary.js';
import { getStorageMode, isProductionEnv } from '../../config/storage.js';
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

/**
 * Upload product image to Cloudinary / tenant storage
 * @route POST /api/products/upload-image
 */
export const uploadProductImage = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    if (!sellerId) {
      return errorResponse(res, 401, 'Unauthorized tenant context.');
    }

    const { image, fileName, mimeType } = req.body;

    if (!image) {
      return errorResponse(res, 400, 'Image data is required.');
    }

    // Validate MIME type (JPG, PNG, WEBP)
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const detectedMime = (mimeType || '').toLowerCase().trim();
    if (detectedMime && !allowedMimeTypes.includes(detectedMime)) {
      return errorResponse(
        res,
        400,
        `Unsupported image format (${detectedMime}). Only JPG, PNG, and WEBP are allowed.`
      );
    }

    // If data URI, validate header MIME type
    if (image.startsWith('data:')) {
      const match = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
      if (match) {
        const headerMime = match[1].toLowerCase();
        if (!allowedMimeTypes.includes(headerMime)) {
          return errorResponse(
            res,
            400,
            `Unsupported image format (${headerMime}). Only JPG, PNG, and WEBP are allowed.`
          );
        }
      }
    }

    // File size validation (max 10MB)
    const MAX_SIZE_BYTES = 10 * 1024 * 1024;
    const approximateBytes = Math.round((image.length * 3) / 4);
    if (approximateBytes > MAX_SIZE_BYTES) {
      return errorResponse(res, 400, 'Image size exceeds maximum allowed limit of 10MB.');
    }

    const uploaded = await uploadImageToCloudinary({
      sellerId,
      dataUri: image,
      fileName: fileName || 'product-image.jpg',
      mimeType: detectedMime || 'image/jpeg',
      folder: 'products',
    });

    const message =
      uploaded.provider === 'CLOUDINARY'
        ? 'Product image uploaded to Cloudinary'
        : 'Product image stored locally (development storage)';
    return successResponse(res, 201, message, uploaded);
  } catch (error) {
    console.error('Product Image Upload Error:', error.code || '', error.message);
    return errorResponse(
      res,
      error.status || 500,
      error.message || 'Failed to upload product image',
      error.code ? { code: error.code } : undefined
    );
  }
};

/**
 * Report current image storage mode so the UI can disable uploads when unavailable.
 * @route GET /api/products/storage-status
 */
export const getImageStorageStatus = async (req, res) => {
  const mode = getStorageMode();
  return successResponse(res, 200, 'Storage status', {
    mode,
    production: isProductionEnv(),
    uploadsEnabled: mode !== 'unavailable',
  });
};
