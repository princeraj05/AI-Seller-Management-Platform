# Phase 2B.8 — Amazon Frontend Data Integrity & UX Fixes Report

**Date:** 2026-11-22  
**Scope:** Amazon Frontend Data Integrity, Image Integrity, and Validation Clarity fixes only.  
**Safety Verification:** Zero modifications to `AiModule/`, Flipkart/Meesho/Shopify integrations, `.env`, credentials, MongoDB product records, or git state. Zero Amazon Production API calls or listing submissions were executed. Production publishing remains hard-blocked (`403 PRODUCTION_PUBLISHING_DISABLED`).

---

## 1. Root Causes Identified & Fixes Implemented

### 1.1 Orders Mock Data Removal & Duplicate-Sync Guard
- **Root Cause (`frontend/src/pages/orders/OrdersList.jsx`):**
  - `OrdersList.jsx` imported `mockOrders` from `../../utils/mockData` and substituted `setOrders(mockOrders)` both when `getOrdersApi()` returned an empty array `[]` and when the API threw an error.
  - `handleSyncAmazonOrders` relied solely on button `disabled={syncingAmazon}` without an early `if (syncingAmazon) return;` guard or synchronous ref lock.
- **Fixes Applied:**
  - Created `frontend/src/utils/ordersListHelpers.js` (`extractOrdersFromResponse`, `fetchOrdersSafely`, `createSingleFlightSyncGuard`).
  - Removed `mockOrders` import and fallback completely from `frontend/src/pages/orders/OrdersList.jsx`.
  - Added explicit `ordersError` and `returnsError` states with clear error banners, Retry action, loading spinners, and distinct empty-database vs filter-empty states.
  - Preserved all real database/API orders verbatim.
  - Added explicit early duplicate-submit guard `if (syncingAmazon) return;` plus synchronous `syncingAmazonRef.current` lock in `handleSyncAmazonOrders` (and equivalent `if (syncingReturns) return;` + ref lock in `handleSyncReturns`).

### 1.2 Amazon Listing Product Image Integrity
- **Exact MongoDB & API Trace for "Premium Cotton T-Shirt":**
  - Read-only inspection of MongoDB collection `products` revealed two existing records titled `Premium Cotton T-Shirt` (SKU `TEST-TSHIRT-001`):
    1. `_id: 6afc6bde33fea5b5a9c3cd73` (seller `prince raj` / `My Super Seller Store`):
       - `images[0]`: `"https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500"` — **an external Unsplash stock portrait photo of a man** stored directly in the existing MongoDB document.
       - `images[1]`: `"/uploads/products/black_tshirt_prod_1794939738784_a8e8fb10.jpg"` — local development upload path (which Amazon SP-API rejects as `UNRESOLVED_IMAGE_URL` without a public HTTPS base URL).
    2. `_id: 6afc87d97a16cbfa7316822e` (seller `Prince Raj` / `Prince Seller Hub`):
       - `images[0]`: `"https://res.cloudinary.com/demo/image/upload/sample.jpg"` — Cloudinary demo sample URL seeded by an older test script.
  - Additionally, `backend/src/integrations/marketplaces/amazon/amazon.publisher.service.js` line 795 previously hardcoded `'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800'` as a non-production fallback image when a master product was not found.
  - **Existing MongoDB product records were NOT modified automatically** (per Phase 2B.8 safety rules).
- **Code Bugs Fixed:**
  - Created `frontend/src/utils/amazonListingHelpers.js` (`extractProductImageUrl`, `selectProductImages`, `inspectListingImageUrl`).
  - Updated `frontend/src/pages/marketplaces/AmazonListingPublisher.jsx`:
    - Uses ONLY the selected product's own image URLs (`selectProductImages(prod)`), preserving Cloudinary `secure_url` / HTTPS URLs and never substituting stock photos or another product's image.
    - Step 1 (`ProductThumbnail`), Step 4 preview, and Step 6 preview validate URLs via `inspectListingImageUrl` before rendering `<img>`; missing or invalid URLs (`blob:`, `data:`, `http://`, `file:`, Windows paths, `javascript:`, `localhost`, malformed strings) or load failures (`onError`) render a neutral icon placeholder (`Package` / `ImageOff`).
    - Added cancellation cleanup (`cancelled = true`) to the `new Image()` reachability `useEffect` and reset image/validation/schema/submission states in `handleSelectProduct` so switching products never leaks state or image status across products.
    - Surfaced honest provenance badges in Step 4 (`Cloudinary HTTPS`, `Local Upload (Not Public HTTPS for Amazon)`) and inline validation hints on `otherImages`.
  - Updated `backend/src/modules/channels/channel.controller.js` (`sanitizeEligibleProduct`) and `backend/src/integrations/marketplaces/amazon/amazon.publisher.service.js` (`validateListingData`, `buildSpApiListingPayload`) to extract `secure_url || url` from Cloudinary image objects, and removed the hardcoded Unsplash portrait URL fallback from `amazon.publisher.service.js`.

### 1.3 Listing Validation Error Clarity & Schema Source Honesty
- **Exact Reasons Behind `"Listing Payload Has Validation Errors"` (with Missing Details & Misleading Green Banner):**
  1. When `POST /api/channels/amazon/listings/submissions/validate` returned HTTP 400 (for example, `MISSING_PRODUCT_TYPE` when a product like `Premium Cotton T-Shirt` had an empty `productType` and the seller advanced past Step 2), the controller returned `{ success: false, message, code }` with **no `issues` or `errors` array**, causing Step 6 to show `"Listing Payload Has Validation Errors"` with zero error items rendered.
  2. For products with local `/uploads/...` images (such as `Premium Cotton T-Shirt`'s `images[1]`) or missing GTIN/exemption, `validateAmazonListing` only ran internal attribute validation and did not return `schemaSource` / `validationSource` or evaluate Product Type schema constraints.
  3. In `AmazonListingPublisher.jsx`, Step 6 used `schemaData?.schemaSource === 'DEVELOPMENT_FALLBACK' ? fallback : GREEN Official Schema Verification`. Whenever `schemaData` was `null` (e.g., empty product type or failed fetch), the UI falsely displayed a **green `"Official Schema Verification: Validated against official Amazon Product Type Definitions API v2020-09-01."`** banner.
  4. `Proceed to Submission` used `disabled={validationResult && !validationResult.valid}` (which remained enabled when `validationResult` was `null`) and Step 7 in the top stepper could be clicked directly even with validation errors.
- **Fixes Applied:**
  - Updated `backend/src/modules/channels/channel.controller.js` (`validateAmazonListing`):
    - Returns structured `valid: false`, `errors`, `warnings`, `issues`, `schemaSource`, and `validationSource` even on HTTP 400/404 responses (`MISSING_PRODUCT_ID`, `MISSING_PRODUCT_TYPE`, `PRODUCT_NOT_FOUND`).
    - Evaluates both internal attribute rules (`validateListingData`) and Product Type schema rules (`getProductTypeDefinition` + `validatePayloadAgainstProductTypeSchema`), tagging every issue with `attribute`, `attributeName`, `code`, `severity`, `source`, and `message`, and returning truthful `schemaSource`, `validationSource`, and `schemaNote`.
  - Updated `frontend/src/utils/amazonListingHelpers.js` & `frontend/src/pages/marketplaces/AmazonListingPublisher.jsx`:
    - `normalizeListingValidationResponse` normalizes HTTP 200, 400, 422, and network error responses so every validation failure always renders at least one explicit attribute + reason item.
    - Step 6 renders every blocking validation error with its human attribute label, technical field key, error code, validation source tag (`Official Amazon Schema` / `Development Fallback Schema` / `Internal Validation`), and reason, plus a separate non-blocking warnings section.
    - `resolveSchemaValidationBadge` strictly restricts green official verification styling to `AMAZON_SP_API` only; `DEVELOPMENT_FALLBACK` renders an amber `"Development Fallback Validation (Not Official Amazon Schema)"` banner, and `INTERNAL_VALIDATION` renders a neutral `"Internal Validation Only"` banner.
    - `canProceedToListingSubmission` keeps both `Proceed to Submission` and stepper Step 7 disabled whenever validation has not run, is in progress, is stale after form/product-type edits (`validationFingerprint`), or has any blocking error. Re-validation refreshes the entire result and error list immediately.

---

## 2. Exact Files Changed

### Created
- `frontend/src/utils/ordersListHelpers.js`
- `frontend/src/utils/amazonListingHelpers.js`
- `backend/tests/amazonPhase2B8DataIntegrityUI.test.js`
- `docs/amazon/PHASE_2B8_DATA_INTEGRITY_UI_FIX_REPORT.md`

### Modified
- `frontend/src/pages/orders/OrdersList.jsx`
- `frontend/src/pages/marketplaces/AmazonListingPublisher.jsx`
- `backend/src/modules/channels/channel.controller.js`
- `backend/src/integrations/marketplaces/amazon/amazon.publisher.service.js`

---

## 3. Automated Test & Build Results

| Verification Command / Suite | Result | Notes |
| --- | --- | --- |
| `node --test backend/tests/amazonPhase2B8DataIntegrityUI.test.js` | **10 / 10 PASSED (0 failed)** | Covers all 10 Phase 2B.8 scenarios (empty orders, API failure, no `mockOrders`, duplicate sync clicks, image selection/Cloudinary, missing placeholder, invalid image fallback, validation error details + re-validation, development fallback schema labeling, submission disabled with errors/stale state) |
| `node --test` Phase 2A–2B.8 combined (`2B8`, `2B6`, `2B4`, `2B3`, `2B1`, `2B`, `2A`) | **65 / 65 PASSED (0 failed)** | Full regression across Phases 2A through 2B.8 |
| `node backend/tests/amazonListingAlignment.test.js` | **14 / 14 PASSED (0 failed)** | 13-field master product immutability, approval rules, store isolation |
| `node backend/tests/marketplaceNavigationSecurity.test.js` | **20 / 20 PASSED (0 failed)** | Cross-tenant isolation, `MISSING_PRODUCT_TYPE` HTTP 400 contract, Production 503 policy |
| Legacy Amazon suites (`test_amazon_orders.js`, `test_amazon_task7.js`, `test_amazon_task9.js`, `test_amazon_task9_3.js`) | **55 / 55 PASSED (0 failed)** | Orders (`18/18`), Task 7 (`14/14`), Task 9 (`16/16`), Task 9.3 (`7/7`) |
| `npm --prefix frontend run build` (`vite build`) | **PASS** | `1600 modules transformed`, built cleanly in `19.82s` |

*Note: All tests above are automated offline/unit regression tests plus a Vite production build. Interactive live browser verification was **not** performed in this phase.*

---

## 4. Unresolved Data Item (Requires Your Manual Action, Intentionally Untouched)

- **Existing MongoDB record `_id: 6afc6bde33fea5b5a9c3cd73` (`Premium Cotton T-Shirt`, SKU `TEST-TSHIRT-001`):**
  - Because Phase 2B.8 strictly prohibits automatically modifying existing MongoDB product records or images, this document still stores:
    1. `images[0] = "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500"` (the Unsplash portrait photo)
    2. `images[1] = "/uploads/products/black_tshirt_prod_1794939738784_a8e8fb10.jpg"` (local `/uploads/...` path)
  - To replace the portrait image on that specific product and resolve the local `/uploads/...` Amazon validation error for it, edit `Premium Cotton T-Shirt` from **Products → Edit Product** and upload a real Cloudinary product photo (and remove the legacy Unsplash and `/uploads/...` URLs).
  - Similarly, if your local `localhost:5000` backend server was started without `nodemon`, restart it so the updated `validateAmazonListing` and `sanitizeEligibleProduct` backend logic is active.
