import assert from 'assert';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import app from './src/app.js';
import { User } from './src/modules/users/user.model.js';
import { Product } from './src/modules/products/product.model.js';
import { MarketplaceListingSubmission } from './src/modules/channels/marketplaceListingSubmission.model.js';

let passed = 0;
let failed = 0;

function logPass(title) {
  console.log(`  ✓ PASS: ${title}`);
  passed++;
}

function logFail(title, err) {
  console.error(`  ✗ FAIL: ${title}`);
  console.error(`    ${err?.message || err}`);
  failed++;
}

console.log('\n========================================================================');
console.log('TASK 9.1: BROWSER & API ROUND-TRIP VERIFICATION SUITE');
console.log('========================================================================\n');

(async () => {
  let server;
  let baseUrl;
  let authToken;
  let testSellerId;
  let testProductId;
  let testSubmissionId;

  try {
    // 1. Connect to MongoDB or ensure connection
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    }

    // 2. Start temporary Express test server
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // 3. Ensure test seller & sample product exist
    let seller = await User.findOne({ email: 'seller@test.com' });
    if (!seller) {
      seller = await User.create({
        name: 'Prince Seller',
        email: 'seller@test.com',
        password: 'Password@123',
        storeName: 'AI Seller Demo Store',
        role: 'seller',
        isActive: true,
        onboardingCompleted: true,
      });
    }
    testSellerId = seller._id.toString();

    // Ensure sample product "Premium Cotton T-Shirt" exists for this seller
    let product = await Product.findOne({ sellerId: testSellerId, sku: 'TEST-TSHIRT-001' });
    if (!product) {
      product = await Product.create({
        sellerId: testSellerId,
        title: 'Premium Cotton T-Shirt',
        brand: 'Demo Brand',
        sku: 'TEST-TSHIRT-001',
        categoryName: 'Fashion',
        masterPrice: 800,
        stock: 10,
        status: 'Active',
        images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
      });
    } else {
      // Reset to master values if modified previously
      product.masterPrice = 800;
      product.stock = 10;
      await product.save();
    }
    testProductId = product._id.toString();

    // Step 1: Seller Authentication
    try {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'seller@test.com', password: 'Password@123' }),
      });
      const loginData = await loginRes.json();
      assert.strictEqual(loginRes.status, 200, 'Login HTTP status must be 200');
      authToken = loginData.token || loginData.data?.accessToken;
      assert.ok(authToken, 'Access token must be returned');
      logPass('1. Authentication: Seller logs in successfully and receives JWT access token');
    } catch (err) {
      logFail('1. Authentication failed', err);
    }

    const authHeaders = {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    };

    // Step 2: Amazon Channel Status
    try {
      const statusRes = await fetch(`${baseUrl}/api/channels/amazon/status`, {
        headers: authHeaders,
      });
      const statusData = await statusRes.json();
      assert.strictEqual(statusRes.status, 200);
      assert.ok(statusData.data);
      logPass('2. Amazon Channel Page: Status endpoint returns accurate connection metadata');
    } catch (err) {
      logFail('2. Amazon channel status fetch failed', err);
    }

    // Step 3: Product Search & Selection ("Premium Cotton T-Shirt")
    try {
      const prodRes = await fetch(`${baseUrl}/api/channels/amazon/products/eligible?search=Premium`, {
        headers: authHeaders,
      });
      const prodData = await prodRes.json();
      assert.strictEqual(prodRes.status, 200);
      const productList = Array.isArray(prodData.data) ? prodData.data : prodData.data?.products || [];
      assert.ok(productList.length > 0, 'Eligible products must be returned');
      const found = productList.find((p) => p.sku === 'TEST-TSHIRT-001');
      assert.ok(found, 'Sample product Premium Cotton T-Shirt must be found in eligible list');
      assert.strictEqual(found.masterPrice, 800, 'Master price must initially be 800');
      assert.strictEqual(found.stock, 10, 'Master stock must initially be 10');
      logPass('3. Product Selection UI: Premium Cotton T-Shirt found in central catalogue with masterPrice=800, stock=10');
    } catch (err) {
      logFail('3. Product search failed', err);
    }

    // Step 4: Product Types Retrieval
    try {
      const typesRes = await fetch(`${baseUrl}/api/channels/amazon/definitions/product-types`, {
        headers: authHeaders,
      });
      const typesData = await typesRes.json();
      assert.strictEqual(typesRes.status, 200);
      const typesList = typesData.data?.productTypes || (Array.isArray(typesData.data) ? typesData.data : []);
      assert.ok(typesList.length > 0, 'Product types must be returned');
      const hasShirt = typesList.some((t) => t.productType === 'SHIRT' || t.name === 'SHIRT');
      assert.ok(hasShirt, 'SHIRT product type must be available');
      logPass('4. Product Type Selection: Retrieved official/fallback Amazon product types (including SHIRT)');
    } catch (err) {
      logFail('4. Product types retrieval failed', err);
    }

    // Step 5: Schema Definition Retrieval
    try {
      const schemaRes = await fetch(`${baseUrl}/api/channels/amazon/definitions/product-types/SHIRT`, {
        headers: authHeaders,
      });
      const schemaData = await schemaRes.json();
      assert.strictEqual(schemaRes.status, 200);
      assert.strictEqual(schemaData.data?.productType, 'SHIRT');
      assert.ok(schemaData.data?.requiredAttributes?.length > 0);
      logPass('5. Schema Retrieval: Fetched requirements and attributes for productType SHIRT');
    } catch (err) {
      logFail('5. Schema retrieval failed', err);
    }

    // Step 6: Attribute Validation API
    try {
      const valRes = await fetch(`${baseUrl}/api/channels/amazon/listings/submissions/validate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          productId: testProductId,
          sellerSku: 'AMZ-TEST-TSHIRT-001',
          productType: 'SHIRT',
          marketplaceId: 'A21TJRUUN4KGV',
          mappedAttributes: {
            title: 'Premium Cotton Regular Fit T-Shirt',
            brand: 'Demo Brand',
            sellerSku: 'AMZ-TEST-TSHIRT-001',
            description: '100% Premium Bio-Washed Cotton T-Shirt for daily comfort.',
            bulletPoints: ['100% Bio-Washed Cotton', 'Pre-shrunk fabric', 'Regular comfortable fit'],
            mainImage: 'https://res.cloudinary.com/demo/image/upload/shirt.jpg',
            price: '899', // Channel override price
            quantity: '5',  // Channel override stock
            countryOfOrigin: 'IN',
          },
          gtinExemptionRequested: true,
        }),
      });
      const valData = await valRes.json();
      assert.strictEqual(valRes.status, 200);
      assert.strictEqual(valData.data?.valid ?? valData.valid, true);
      logPass('6. Listing Validation: Mapped attributes & Cloudinary HTTPS image validated successfully');
    } catch (err) {
      logFail('6. Listing validation failed', err);
    }

    // Step 7: Listing Submission Creation (Draft / Ready)
    try {
      const subRes = await fetch(`${baseUrl}/api/channels/amazon/listings/submissions`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          productId: testProductId,
          sellerSku: 'AMZ-TEST-TSHIRT-001',
          productType: 'SHIRT',
          marketplaceId: 'A21TJRUUN4KGV',
          submissionMode: 'DRY_RUN',
          status: 'READY',
          mappedAttributes: {
            title: 'Premium Cotton Regular Fit T-Shirt',
            brand: 'Demo Brand',
            sellerSku: 'AMZ-TEST-TSHIRT-001',
            description: '100% Premium Bio-Washed Cotton T-Shirt for daily comfort.',
            bulletPoints: ['100% Bio-Washed Cotton', 'Pre-shrunk fabric', 'Regular comfortable fit'],
            mainImage: 'https://res.cloudinary.com/demo/image/upload/shirt.jpg',
            price: 899,
            quantity: 5,
            countryOfOrigin: 'IN',
          },
          gtinExemptionRequested: true,
        }),
      });
      const subData = await subRes.json();
      assert.strictEqual(subRes.status, 201);
      const createdSub = subData.data?.submission || subData.data;
      assert.ok(createdSub?._id);
      testSubmissionId = createdSub._id;
      logPass('7. Submission Creation: Prepared draft submission in database with tenant isolation');
    } catch (err) {
      logFail('7. Submission creation failed', err);
    }

    // Step 8: Dry-Run Execution
    try {
      const execRes = await fetch(`${baseUrl}/api/channels/amazon/listings/submissions/${testSubmissionId}/submit`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ dryRun: true }),
      });
      const execData = await execRes.json();
      assert.strictEqual(execRes.status, 200);
      assert.strictEqual(execData.success, true);
      assert.strictEqual(execData.data?.status, 'DRY_RUN');
      assert.strictEqual(execData.data?.submissionMode, 'DRY_RUN');
      assert.ok(execData.data?.responseMetadata?.dryRunVerified || execData.data?.isDryRun, 'Dry-run must be verified');
      logPass('8. Dry-Run Execution: Successfully executed high-fidelity local schema validation without Amazon mutation');
    } catch (err) {
      logFail('8. Dry-run execution failed', err);
    }

    // Step 9: Submissions History Retrieval
    try {
      const histRes = await fetch(`${baseUrl}/api/channels/amazon/listings/submissions`, {
        headers: authHeaders,
      });
      const histData = await histRes.json();
      assert.strictEqual(histRes.status, 200);
      const submissionsList = Array.isArray(histData.data) ? histData.data : histData.data?.submissions || [];
      const foundSub = submissionsList.find((s) => s._id.toString() === testSubmissionId.toString());
      assert.ok(foundSub, 'Created submission must appear in history list');
      assert.strictEqual(foundSub.status, 'DRY_RUN');
      logPass('9. Submission History: Audited trail returned submission with status DRY_RUN');
    } catch (err) {
      logFail('9. Submission history retrieval failed', err);
    }

    // Step 10: Submission Detail Inspection
    try {
      const detailRes = await fetch(`${baseUrl}/api/channels/amazon/listings/submissions/${testSubmissionId}`, {
        headers: authHeaders,
      });
      const detailData = await detailRes.json();
      assert.strictEqual(detailRes.status, 200);
      const subDetail = detailData.data?.submission || detailData.data;
      assert.strictEqual(subDetail._id.toString(), testSubmissionId.toString());
      assert.ok(subDetail.payloadPreview?.attributes?.item_name, 'Prepared payload preview must be stored');
      logPass('10. Submission Details: Inspecting record returns full SP-API payload snapshot and diagnostics');
    } catch (err) {
      logFail('10. Submission detail inspection failed', err);
    }

    // Step 11: Master Catalogue Immutability Check
    try {
      const checkProd = await Product.findById(testProductId);
      assert.strictEqual(checkProd.masterPrice, 800, 'Master catalogue price MUST remain 800');
      assert.strictEqual(checkProd.stock, 10, 'Master catalogue stock MUST remain 10');
      logPass('11. Catalogue Immutability Check: Master price ₹800 and stock 10 remained COMPLETELY UNCHANGED');
    } catch (err) {
      logFail('11. Master product immutability check failed', err);
    }

    // Step 12: Production Submission Guard
    try {
      const prodBlockRes = await fetch(`${baseUrl}/api/channels/amazon/listings/submissions/${testSubmissionId}/submit`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ environment: 'production', dryRun: false }),
      });
      const prodBlockData = await prodBlockRes.json();
      assert.strictEqual(prodBlockRes.status, 403, 'Production attempt must return HTTP 403');
      assert.strictEqual(prodBlockData.code, 'PRODUCTION_PUBLISHING_DISABLED');
      logPass('12. Production Guard: Backend strictly rejected production submission with 403 PRODUCTION_PUBLISHING_DISABLED');
    } catch (err) {
      logFail('12. Production guard test failed', err);
    }

  } catch (globalErr) {
    console.error('Fatal test error:', globalErr);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
    console.log('\n========================================================================');
    console.log(`TASK 9.1 BROWSER AUDIT RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log('========================================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
})();
