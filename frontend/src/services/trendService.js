import api from './api';

export const getTrendsOverviewApi = async (params = {}) => {
  try {
    const response = await api.get('/trends', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch trends overview');
    }
    throw new Error(error.message || 'Network error fetching trends overview');
  }
};

export const getMarketTrendsApi = async (params = {}) => {
  try {
    const response = await api.get('/trends/market', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch market trends');
    }
    throw new Error(error.message || 'Network error fetching market trends');
  }
};

export const getProductTrendsApi = async (params = {}) => {
  try {
    const response = await api.get('/trends/products', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch product trends');
    }
    throw new Error(error.message || 'Network error fetching product trends');
  }
};

export const getFashionTrendsApi = async (params = {}) => {
  try {
    const response = await api.get('/trends/fashion', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch fashion trends');
    }
    throw new Error(error.message || 'Network error fetching fashion trends');
  }
};

export const getColorTrendsApi = async (params = {}) => {
  try {
    const response = await api.get('/trends/colors', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch color trends');
    }
    throw new Error(error.message || 'Network error fetching color trends');
  }
};

export const getOpportunitiesApi = async (params = {}) => {
  try {
    const response = await api.get('/trends/opportunities', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch trend opportunities');
    }
    throw new Error(error.message || 'Network error fetching trend opportunities');
  }
};
