import { buildProductGenerationPrompt } from './ai.prompt.js';
import { AIJob } from './ai.model.js';
import { config } from '../../config/env.js';

export const generateProductAIService = async (tenant, inputData) => {
  const { sellerId, storeId } = tenant;
  const openaiKey = config.ai?.openaiApiKey || process.env.OPENAI_API_KEY;
  const geminiKey = config.ai?.geminiApiKey || process.env.GEMINI_API_KEY;
  const providerPreference = (process.env.AI_PROVIDER || 'openai').toLowerCase();

  const promptText = buildProductGenerationPrompt(inputData);

  let structuredOutput = null;
  let apiError = null;
  let usedProvider = null;

  // Try Gemini if selected or if Gemini key is set and OpenAI key is absent
  if (geminiKey && (providerPreference === 'gemini' || !openaiKey)) {
    try {
      usedProvider = 'gemini';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${promptText}\n\nReturn raw valid JSON only.` }] }],
        }),
      });

      if (response.ok) {
        const resData = await response.json();
        const content = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanJsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
        structuredOutput = JSON.parse(cleanJsonStr);
      } else {
        const errJson = await response.json();
        apiError = errJson.error?.message || 'Gemini API call returned error';
      }
    } catch (err) {
      apiError = err.message;
    }
  }

  // Try OpenAI if structuredOutput is still null and OpenAI key is set
  if (!structuredOutput && openaiKey) {
    try {
      usedProvider = 'openai';
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are an AI e-commerce product catalog generator. Return ONLY raw JSON.' },
            { role: 'user', content: promptText },
          ],
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const resData = await response.json();
        const content = resData.choices?.[0]?.message?.content || '';
        const cleanJsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
        structuredOutput = JSON.parse(cleanJsonStr);
      } else {
        const errJson = await response.json();
        apiError = errJson.error?.message || 'OpenAI API call returned error';
      }
    } catch (err) {
      apiError = err.message;
    }
  }

  if (!openaiKey && !geminiKey && !usedProvider) {
    apiError = 'AI_PROVIDER_KEY_NOT_CONFIGURED';
  }

  const isFallback = !structuredOutput;

  // Structured Fallback template if AI call failed or keys unavailable
  if (!structuredOutput) {
    usedProvider = 'fallback';
    structuredOutput = {
      title: `${inputData.brand || 'Bhartiye Crafts'} Handcrafted ${inputData.category || 'Ethnic'} Product - ${inputData.prompt || 'Premium Quality'}`,
      shortDescription: `Elegant, durable, high-quality handcrafted item designed for ${inputData.category || 'lifestyle'}.`,
      description: `Upgrade your collection with this authentic ${inputData.prompt || 'product'}. Made with attention to detail and traditional craftsmanship. Perfect for casual, festive, and daily use.`,
      category: inputData.category || 'Fashion',
      brand: inputData.brand || 'Bhartiye Crafts',
      material: inputData.material || 'Cotton Blend',
      color: inputData.color || 'Multicolor',
      attributes: {
        'Quality Grade': 'Premium A+',
        'Origin': 'Made in India',
        'Craftsmanship': 'Handcrafted',
        'Care Instructions': 'Gentle Care',
      },
      keywords: ['handicraft', 'indian seller', 'ecommerce', 'best seller', 'premium'],
      tags: ['ai-generated', 'draft', 'new-arrival'],
      seo: {
        title: `${inputData.brand || 'Bhartiye Crafts'} - ${inputData.prompt || 'Item'} Online`,
        description: `Buy authentic ${inputData.prompt || 'product'} online at best prices. High quality, quick shipping across India.`,
        keywords: ['buy online', 'best price', 'handcrafted'],
      },
    };
  }

  structuredOutput.isFallback = isFallback;
  structuredOutput.aiProvider = usedProvider;

  // Save AI Job audit log
  try {
    await AIJob.create({
      sellerId,
      storeId,
      type: 'product_generator',
      status: isFallback ? 'completed' : 'completed',
      input: { prompt: inputData.prompt, category: inputData.category, brand: inputData.brand },
      output: structuredOutput,
      error: apiError,
    });
  } catch (dbErr) {
    console.warn('AIJob audit log creation failed:', dbErr.message);
  }

  return structuredOutput;
};
