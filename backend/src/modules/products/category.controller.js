import { validateCategoryInput } from './category.validator.js';
import { getCategoriesService, createCategoryService } from './category.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const getCategories = async (req, res) => {
  try {
    const categories = await getCategoriesService(req.tenant.sellerId);
    return successResponse(res, 200, 'Categories fetched successfully', { categories });
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch categories');
  }
};

export const createCategory = async (req, res) => {
  try {
    const { isValid, errors } = validateCategoryInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'Category validation failed', errors);
    }

    const category = await createCategoryService(req.tenant, req.body);
    return successResponse(res, 201, 'Category created successfully', { category });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to create category');
  }
};
