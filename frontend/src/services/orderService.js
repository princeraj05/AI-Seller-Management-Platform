import api from './api';

export const getOrdersApi = async (params = {}) => {
  try {
    const response = await api.get('/orders', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch orders');
    }
    throw new Error(error.message || 'Network error fetching orders');
  }
};

export const getOrderByIdApi = async (orderId) => {
  try {
    const response = await api.get(`/orders/${orderId}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch order details');
    }
    throw new Error(error.message || 'Network error fetching order details');
  }
};

export const createOrderApi = async (orderData) => {
  try {
    const response = await api.post('/orders', orderData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to create order');
    }
    throw new Error(error.message || 'Network error creating order');
  }
};

export const updateOrderStatusApi = async (orderId, statusData) => {
  try {
    const response = await api.patch(`/orders/${orderId}/status`, statusData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to update order status');
    }
    throw new Error(error.message || 'Network error updating order status');
  }
};
