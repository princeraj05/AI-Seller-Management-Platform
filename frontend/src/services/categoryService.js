import api from './api';

export const getCategoriesApi = async () => {
  try {
    const response = await api.get('/products/categories');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch categories');
    }
    throw new Error(error.message || 'Network error fetching categories');
  }
};

export const createCategoryApi = async (categoryData) => {
  try {
    const response = await api.post('/products/categories', categoryData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to create category');
    }
    throw new Error(error.message || 'Network error creating category');
  }
};
