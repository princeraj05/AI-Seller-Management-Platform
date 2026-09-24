import api from './api';

export const getAnalyticsOverviewApi = async (params = {}) => {
  try {
    const response = await api.get('/analytics/overview', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch analytics overview');
    }
    throw new Error(error.message || 'Network error fetching analytics overview');
  }
};

export const getSalesAnalyticsApi = async (params = {}) => {
  try {
    const response = await api.get('/analytics/sales', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch sales analytics');
    }
    throw new Error(error.message || 'Network error fetching sales analytics');
  }
};

export const getRevenueAnalyticsApi = async (params = {}) => {
  try {
    const response = await api.get('/analytics/revenue', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch revenue analytics');
    }
    throw new Error(error.message || 'Network error fetching revenue analytics');
  }
};

export const getProfitAnalyticsApi = async (params = {}) => {
  try {
    const response = await api.get('/analytics/profit', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch profit analytics');
    }
    throw new Error(error.message || 'Network error fetching profit analytics');
  }
};

export const getProductAnalyticsApi = async (params = {}) => {
  try {
    const response = await api.get('/analytics/products', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch product analytics');
    }
    throw new Error(error.message || 'Network error fetching product analytics');
  }
};

export const getChannelAnalyticsApi = async (params = {}) => {
  try {
    const response = await api.get('/analytics/channels', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch channel analytics');
    }
    throw new Error(error.message || 'Network error fetching channel analytics');
  }
};
