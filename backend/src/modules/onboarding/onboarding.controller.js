import { validateOnboardingInput } from './onboarding.validator.js';
import { createOrUpdateOnboardingService } from './onboarding.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const submitOnboarding = async (req, res) => {
  try {
    const { isValid, errors } = validateOnboardingInput(req.body);

    if (!isValid) {
      return errorResponse(res, 400, 'Validation failed', errors);
    }

    const result = await createOrUpdateOnboardingService(req.user, req.body);

    return successResponse(res, 200, 'Onboarding completed successfully', {
      store: result.store,
      onboardingCompleted: true,
    });
  } catch (error) {
    console.error('Error in submitOnboarding controller:', error);
    return errorResponse(res, 500, error.message || 'Server error during onboarding');
  }
};
