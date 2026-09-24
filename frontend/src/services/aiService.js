import api from './api';

export const generateProductAIApi = async (aiInput) => {
  try {
    const response = await api.post('/ai/generate-product', aiInput);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'AI generation failed');
    }
    throw new Error(error.message || 'Network error during AI generation');
  }
};
