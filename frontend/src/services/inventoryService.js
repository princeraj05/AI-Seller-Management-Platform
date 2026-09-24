import api from './api';

export const getInventoryApi = async (params = {}) => {
  try {
    const response = await api.get('/inventory', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch inventory');
    }
    throw new Error(error.message || 'Network error fetching inventory');
  }
};

export const getInventoryLedgerApi = async (params = {}) => {
  try {
    const response = await api.get('/inventory/ledger', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch inventory ledger');
    }
    throw new Error(error.message || 'Network error fetching inventory ledger');
  }
};

export const adjustStockApi = async (adjustmentData) => {
  try {
    const response = await api.post('/inventory/adjust', adjustmentData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to adjust stock');
    }
    throw new Error(error.message || 'Network error adjusting stock');
  }
};
