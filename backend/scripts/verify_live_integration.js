import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AiMicroserviceClient,
  AiMicroserviceError,
} from '../src/services/aiMicroservice.client.js';
import { config } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runLiveVerification() {
  console.log('====================================================');
  console.log('PHASE 03.1: LIVE NODE.JS ↔ PYTHON INTEGRATION CHECK');
  console.log('====================================================\n');

  console.log('1. Configuration Inspection:');
  console.log(`   - AI_SERVICE_URL: ${config.aiService.url}`);
  console.log(`   - AI_SERVICE_TIMEOUT: ${config.aiService.timeout}ms`);
  console.log(`   - AI_SERVICE_SECRET: [CONFIGURED - ${config.aiService.secret ? config.aiService.secret.length + ' chars' : 'EMPTY'}]`);

  const client = new AiMicroserviceClient();

  // Step 1: Health & Authentication Handshake
  console.log('\n2. Testing Connectivity & Internal Authentication Handshake...');
  try {
    const health = await client.checkHealth();
    console.log('   ✅ [SUCCESS] Node.js successfully communicated with Python FastAPI microservice.');
    console.log(`   - Service Status: ${health.available ? 'READY' : 'DEGRADED'}`);
    console.log(`   - Vision Provider: ${health.status?.vision_provider || 'unknown'}`);
    console.log(`   - Vision Model: ${health.status?.vision_model_configured || 'unknown'}`);
    console.log(`   - Vision Ready: ${health.status?.vision_ready}`);
    console.log(`   - OCR Engine: ${health.status?.ocr_engine || 'PaddleOCR'}`);
    console.log(`   - OCR Library Installed: ${health.status?.ocr_library_installed}`);
    console.log(`   - In-Memory Cache Stats:`, health.status?.cache || 'N/A');
  } catch (err) {
    console.error(`   ❌ [FAIL] Health check failed:`, err.message);
    if (err instanceof AiMicroserviceError) {
      console.error(`      Code: ${err.code}, Status: ${err.statusCode}`);
      console.error(`      Details:`, err.details);
    }
    process.exit(1);
  }

  // Step 2: Handicraft Image Inference Check
  console.log('\n3. Real Handicraft Image Inference Check:');
  const possibleImagePath = process.argv[2];

  if (!possibleImagePath || !fs.existsSync(possibleImagePath)) {
    console.log('   ℹ️  [PENDING] No genuine handicraft image fixture was specified.');
    console.log('      Per Phase 03.1 strict rules, no synthetic or mock image will be used.');
    console.log('      Live vision inference validation remains PENDING until a genuine handicraft photograph is provided.');
    console.log('      To test with a genuine image in the future, run:');
    console.log('      node backend/scripts/verify_live_integration.js <path-to-handicraft-image.jpg>');
  } else {
    console.log(`   Found candidate image at: ${possibleImagePath}`);
    try {
      const imageBuffer = fs.readFileSync(possibleImagePath);
      const filename = path.basename(possibleImagePath);
      const ext = path.extname(possibleImagePath).toLowerCase();
      const mimeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
      };
      const mimeType = mimeMap[ext] || 'image/jpeg';

      console.log(`   Uploading ${(imageBuffer.length / 1024).toFixed(1)} KB image to Python microservice...`);
      const response = await client.extractProductAttributes({
        imageBuffer,
        filename,
        mimeType,
        sellerId: 'live_verification_seller_001',
        storeId: 'store_delhi_crafts',
        enableOcr: true,
        userHint: 'Authentic Indian handicraft product',
      });

      console.log('   ✅ [SUCCESS] Live image analysis completed and structurally validated!');
      console.log(`   - Product Type: ${response.data.product_type}`);
      console.log(`   - Category: ${response.data.category.primary_category} > ${response.data.category.subcategory} (confidence: ${(response.data.category.confidence * 100).toFixed(1)}%)`);
      console.log(`   - Attributes Extracted: ${response.data.attributes.length}`);
      response.data.attributes.forEach((attr) => {
        console.log(`     * ${attr.name}: ${attr.value} (${attr.evidence_source}, confidence: ${(attr.confidence * 100).toFixed(1)}%)`);
      });
      console.log(`   - OCR Status: ${response.data.ocr.status} (text: "${response.data.ocr.extracted_text}")`);
      console.log(`   - Processing Metadata:`, response.data.processing_metadata);
    } catch (inferErr) {
      console.error('   ❌ [FAIL] Live inference request failed:', inferErr.message);
      if (inferErr instanceof AiMicroserviceError) {
        console.error(`      Code: ${inferErr.code}, Status: ${inferErr.statusCode}`);
      }
    }
  }

  console.log('\n====================================================');
  console.log('PHASE 03.1 LIVE VERIFICATION COMPLETE');
  console.log('====================================================\n');
}

runLiveVerification().catch((err) => {
  console.error('Fatal live verification error:', err);
  process.exit(1);
});
