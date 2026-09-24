import api from './api';

export const getReturnsApi = async (params = {}) => {
  try {
    const response = await api.get('/returns', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch returns');
    }
    throw new Error(error.message || 'Network error fetching returns');
  }
};

export const getReturnByIdApi = async (returnId) => {
  try {
    const response = await api.get(`/returns/${returnId}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch return details');
    }
    throw new Error(error.message || 'Network error fetching return details');
  }
};

export const createReturnApi = async (returnData) => {
  try {
    const response = await api.post('/returns', returnData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to create return request');
    }
    throw new Error(error.message || 'Network error creating return request');
  }
};

export const inspectReturnItemApi = async (returnId, itemId, inspectionData) => {
  try {
    const response = await api.patch(`/returns/${returnId}/items/${itemId}/inspect`, inspectionData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to inspect return item');
    }
    throw new Error(error.message || 'Network error inspecting return item');
  }
};
