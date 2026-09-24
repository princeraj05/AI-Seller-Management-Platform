import { validateAIGenerateInput } from './ai.validator.js';
import { generateProductAIService } from './ai.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const generateProductAI = async (req, res) => {
  try {
    const { isValid, errors } = validateAIGenerateInput(req.body);
    if (!isValid) {
      return errorResponse(res, 400, 'AI generation validation failed', errors);
    }

    const aiResult = await generateProductAIService(req.tenant, req.body);
    const isFallback = aiResult?.isFallback || false;
    const msg = isFallback
      ? 'AI product draft generated using fallback template (AI provider key not configured or API call failed)'
      : 'AI product draft generated successfully';

    return successResponse(res, 200, msg, {
      draft: aiResult,
      isFallback,
      aiProvider: aiResult?.aiProvider || 'fallback',
    });
  } catch (error) {
    console.error('Error in generateProductAI controller:', error);
    return errorResponse(res, 500, error.message || 'AI generation failed');
  }
};
