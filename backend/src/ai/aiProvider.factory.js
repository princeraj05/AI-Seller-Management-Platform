import { OpenAIProvider } from './providers/openai.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';

export const getAiProvider = () => {
  const providerType = (process.env.AI_PROVIDER || 'openai').toLowerCase().trim();

  switch (providerType) {
    case 'gemini':
      return new GeminiProvider();
    case 'openai':
    default:
      return new OpenAIProvider();
  }
};
