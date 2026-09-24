import api from './api';

export const submitOnboardingApi = async (onboardingData) => {
  try {
    const response = await api.post('/onboarding', onboardingData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Onboarding submission failed');
    }
    throw new Error(error.message || 'Network error during onboarding');
  }
};
