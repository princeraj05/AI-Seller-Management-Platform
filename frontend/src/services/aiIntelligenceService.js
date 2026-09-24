import api from './api';

export const getAiOverviewApi = async (params = {}) => {
  try {
    const response = await api.get('/ai-intelligence', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch AI intelligence overview');
    }
    throw new Error(error.message || 'Network error fetching AI intelligence overview');
  }
};

export const getAiInsightsApi = async (params = {}) => {
  try {
    const response = await api.get('/ai-intelligence/insights', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch AI insights');
    }
    throw new Error(error.message || 'Network error fetching AI insights');
  }
};

export const getAiRecommendationsApi = async (params = {}) => {
  try {
    const response = await api.get('/ai-intelligence/recommendations', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch AI recommendations');
    }
    throw new Error(error.message || 'Network error fetching AI recommendations');
  }
};

export const getAiAlertsApi = async (params = {}) => {
  try {
    const response = await api.get('/ai-intelligence/alerts', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch AI alerts');
    }
    throw new Error(error.message || 'Network error fetching AI alerts');
  }
};

export const askAiAssistantApi = async (question) => {
  try {
    const response = await api.post('/ai-intelligence/assistant', { question });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to process AI assistant question');
    }
    throw new Error(error.message || 'Network error processing AI assistant question');
  }
};
