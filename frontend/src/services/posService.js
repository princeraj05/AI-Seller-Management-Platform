import api from './api';

export const checkoutPOSApi = async (checkoutData, idempotencyKey = null) => {
  try {
    const headers = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const response = await api.post('/pos/checkout', checkoutData, { headers });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'POS Checkout failed');
    }
    throw new Error(error.message || 'Network error during POS checkout');
  }
};

export const getPOSBillsApi = async (params = {}) => {
  try {
    const response = await api.get('/pos/bills', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch POS bills');
    }
    throw new Error(error.message || 'Network error fetching POS bills');
  }
};
