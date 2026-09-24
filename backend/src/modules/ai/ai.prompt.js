/**
 * AI Prompt Templates for Ecommerce Catalog Generation
 */

export const buildProductGenerationPrompt = (data) => {
  const { prompt, category, brand, material, color } = data;

  return `
You are an expert Indian e-commerce catalog specialist and SEO strategist for Amazon, Flipkart, Myntra, and online storefronts.

Generate a structured e-commerce product listing JSON based strictly on the user input below:

User Provided Details:
- Input Description/Prompt: "${prompt || 'Premium handcrafted Indian item'}"
- Category: "${category || 'Fashion'}"
- Brand: "${brand || 'Bhartiye Crafts'}"
- Material: "${material || 'Premium Fabric'}"
- Color: "${color || 'Multicolor'}"

CRITICAL RULES:
1. Return ONLY a raw valid JSON object without any Markdown block formatting or extra commentary.
2. The JSON object must strictly match this structure:
{
  "title": "Clear, SEO-rich product title (60-80 chars)",
  "shortDescription": "2-line summary highlight",
  "description": "Comprehensive product description with bullet points detailing fabric/material, care instructions, and styling tips.",
  "category": "${category || 'Fashion'}",
  "brand": "${brand || 'Bhartiye Crafts'}",
  "material": "${material || 'Premium Fabric'}",
  "color": "${color || 'Multicolor'}",
  "attributes": {
    "Fit": "Regular Fit",
    "Occasion": "Ethnic & Casual Wear",
    "Pattern": "Traditional Print",
    "Care": "Hand Wash / Gentle Machine Wash"
  },
  "keywords": ["kurta", "ethnic wear", "handicraft", "cotton", "indian fashion"],
  "tags": ["trending", "best-seller", "new-arrival"],
  "seo": {
    "title": "SEO Page Title for Google Search",
    "description": "Meta description (150-160 chars)",
    "keywords": ["ethnic kurta", "indian seller", "buy online"]
  }
}
`;
};
