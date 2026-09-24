import api from './api';

export const getSubscriptionApi = async () => {
  try {
    const response = await api.get('/billing/subscription');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch subscription');
    }
    throw new Error(error.message || 'Network error fetching subscription');
  }
};

export const updateSubscriptionPlanApi = async (plan) => {
  try {
    const response = await api.post('/billing/subscribe', { plan });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to update subscription plan');
    }
    throw new Error(error.message || 'Network error updating subscription plan');
  }
};
