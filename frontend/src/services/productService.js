import api from './api';

export const getProductsApi = async (params = {}) => {
  try {
    const response = await api.get('/products', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch products');
    }
    throw new Error(error.message || 'Network error fetching products');
  }
};

export const getProductByIdApi = async (id) => {
  try {
    const response = await api.get(`/products/${id}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch product details');
    }
    throw new Error(error.message || 'Network error fetching product details');
  }
};

export const createProductApi = async (productData) => {
  try {
    const response = await api.post('/products', productData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to create product');
    }
    throw new Error(error.message || 'Network error creating product');
  }
};

export const updateProductApi = async (id, productData) => {
  try {
    const response = await api.patch(`/products/${id}`, productData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to update product');
    }
    throw new Error(error.message || 'Network error updating product');
  }
};

export const deleteProductApi = async (id) => {
  try {
    const response = await api.delete(`/products/${id}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to delete product');
    }
    throw new Error(error.message || 'Network error deleting product');
  }
};

export const getVariantsApi = async (productId = 'all') => {
  try {
    const url = productId === 'all' ? '/products/variants' : `/products/${productId}/variants`;
    const response = await api.get(url);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch variants');
    }
    throw new Error(error.message || 'Network error fetching variants');
  }
};

export const createVariantApi = async (productId, variantData) => {
  try {
    const response = await api.post(`/products/${productId}/variants`, variantData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to create variant');
    }
    throw new Error(error.message || 'Network error creating variant');
  }
};

export const updateVariantApi = async (productId, variantId, variantData) => {
  try {
    const response = await api.patch(`/products/${productId}/variants/${variantId}`, variantData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to update variant');
    }
    throw new Error(error.message || 'Network error updating variant');
  }
};

export const deleteVariantApi = async (productId, variantId) => {
  try {
    const response = await api.delete(`/products/${productId}/variants/${variantId}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to delete variant');
    }
    throw new Error(error.message || 'Network error deleting variant');
  }
};
