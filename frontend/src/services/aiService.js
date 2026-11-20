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

/**
 * Upload and analyze product photo via Node.js -> Python Vision Microservice.
 * Explicitly sets Content-Type to undefined to allow browser to calculate the multipart boundary.
 *
 * @param {FormData} formData
 * @param {Function} [onUploadProgress]
 * @returns {Promise<Object>}
 */
export const analyzeProductImageApi = async (formData, onUploadProgress) => {
  try {
    const response = await api.post('/ai/analyze-image', formData, {
      headers: {
        'Content-Type': undefined,
      },
      onUploadProgress,
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      const serverMessage = error.response.data.message || error.response.data.error;
      throw new Error(serverMessage || 'Image analysis failed');
    }
    throw new Error(error.message || 'Network error during image analysis');
  }
};
