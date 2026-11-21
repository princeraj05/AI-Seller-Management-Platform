# Phase 2B.6 — Amazon API Contract Compliance & Error Handling Fix Report

**Date:** 2026-11-21  
**Target Configuration:** Environment = `sandbox` | Region = `eu` | Marketplace = India (`A21TJRUUN4KGV`)  
**Scope:** Contract compliance and structured diagnostics fixes identified by the Phase 2B.5 Read-Only Audit across Orders API `v2026-01-01`, Listings Items API `v2021-08-01`, Finances API `v0`, and Product Pricing API `v0`.

---

## 1. Exact Files Changed

### Backend Source Files
1. `backend/src/integrations/marketplaces/amazon/amazon.order.service.js`
   - Aligned `searchAmazonOrders` wire query parameters and enums with official `Orders API v2026-01-01` (`fulfillmentStatuses`, `fulfilledBy`, `maxResultsPerPage`, `paginationToken`, mutually exclusive `createdAfter`/`createdBefore` vs. `lastUpdatedAfter`/`lastUpdatedBefore`, and `includedData` enum validation).
   - Preserved backward-compatible caller aliases (`orderStatuses`, `fulfillmentChannels` mapping `AFN`/`FBA` → `AMAZON` and `MFN`/`FBM` → `MERCHANT`, `pageSize`, `pageToken`/`nextToken`).
   - Removed silent HTTP `400`/`404` swallowing in `searchAmazonOrders` and `getAmazonOrder`; now throws structured secret-safe diagnostics (`status`, `code`, `amazonErrorCode`, `amazonErrorMessage`, `marketplaceId`, `environment`, `region`, `operation`, `diagnostics`, `executionOutcome`).
   - Added repeated-`nextToken` infinite-loop guard in `syncAmazonOrdersService`.
2. `backend/src/integrations/marketplaces/amazon/amazon.listings.service.js`
   - Enforced official `Listings Items API v2021-08-01` `searchListingsItems` `pageSize` bounds (`1..20`, rejecting `< 1`, `> 20`, or non-integer values with `400 INVALID_PAGE_SIZE`).
   - Preserved `nextToken`/`previousToken` pagination and existing Production listing publishing hard-block (`amazon.publisher.service.js`).
   - Removed silent HTTP `400`/`404` swallowing in `searchListingsItems`; added structured secret-safe diagnostics for both `searchListingsItems` and `getListingsItem`.
3. `backend/src/integrations/marketplaces/amazon/amazon.client.js`
   - Upgraded `getOrderFinancialEvents` (`GET /finances/v0/orders/{orderId}/financialEvents`) with official `MaxResultsPerPage` (`1..100`) and multi-page `NextToken` pagination.
   - Merged all `FinancialEvents` list properties across pages (`RefundEventList`, `ShipmentEventList`, etc.) while preserving `mapAmazonFinancialEventsToRefunds` compatibility.
   - Added repeated-`NextToken` (`REPEATED_NEXT_TOKEN`) and `maxPages` (`MAX_PAGES_REACHED`) infinite-loop protection, structured secret-safe `_diagnostics` (including `refundDoesNotImplyPhysicalReturn: true`), and read-only guarantees.
4. `backend/src/integrations/marketplaces/amazon/amazon.pricing.service.js`
   - Preserved `getItemOffers` and `getListingOffers` endpoints, India (`A21TJRUUN4KGV`) & INR currency mapping, and master `Product.masterPrice` immutability.
   - Added structured secret-safe `diagnostics` on responses and error classification (`LWA_UNAUTHORIZED`, `MARKETPLACE_REGION_MISMATCH`, `SP_API_FORBIDDEN`, `RATE_LIMITED`, `PRICING_BAD_REQUEST`, `PRICING_API_ERROR`).

### Tests & Documentation
5. `backend/tests/amazonPhase2B6ContractCompliance.test.js` *(NEW)* — 7 automated regression tests covering all Phase 2B.6 requirements.
6. `docs/amazon/PHASE_2B6_API_CONTRACT_FIX_REPORT.md` *(NEW)* — This report.

*(No changes to `AiModule/`, frontend UI, `.env`, credentials, database records, Flipkart/Meesho/Shopify, or git history.)*

---

## 2. Official API Contract References

All parameter names, types, bounds, enum values, and pagination rules were verified directly against Amazon's official OpenAPI models (`amzn/selling-partner-api-models`):

| API | Official OpenAPI Model | Endpoint(s) | Key Verified Rules |
| --- | --- | --- | --- |
| **Orders API `v2026-01-01`** | `models/orders-api-model/orders_2026-01-01.json` | `GET /orders/2026-01-01/orders`, `GET /orders/2026-01-01/orders/{orderId}` | `fulfillmentStatuses` (7 enums), `fulfilledBy` (`MERCHANT` \| `AMAZON`), `maxResultsPerPage` (`1..100`), `paginationToken` (cursor from `pagination.nextToken`), mutually exclusive `createdAfter`/`createdBefore` vs. `lastUpdatedAfter`/`lastUpdatedBefore`, `includedData` (11 enums) |
| **Listings Items API `v2021-08-01`** | `models/listings-items-api-model/listingsItems_2021-08-01.json` | `GET /listings/2021-08-01/items/{sellerId}`, `GET /listings/2021-08-01/items/{sellerId}/{sku}` | `marketplaceIds` (required), `pageSize` integer `maximum: 20` (default `10`), `pageToken` |
| **Finances API `v0`** | `models/finances-api-model/financesV0.json` | `GET /finances/v0/orders/{orderId}/financialEvents` | `orderId` (path, required), `MaxResultsPerPage` (`1..100`, default `100`), `NextToken` (query & `payload.NextToken` pagination) |
| **Product Pricing API `v0`** | `models/product-pricing-api-model/productPricingV0.json` | `GET /products/pricing/v0/items/{Asin}/offers`, `GET /products/pricing/v0/listings/{SellerSKU}/offers` | `MarketplaceId` (required), `ItemCondition` (required), optional `CustomerType` (`Consumer` \| `Business`) |

---

## 3. Before / After Parameter & Error Mapping

| API | Before (Phase 2B.5 Audit) | After (Phase 2B.6 Fix) |
| --- | --- | --- |
| **Orders `searchOrders`** | `orderStatuses=...` | `fulfillmentStatuses=...` (validated against 7 official enums; accepts legacy `options.orderStatuses`) |
| **Orders `searchOrders`** | `fulfillmentChannels=AFN,MFN` | `fulfilledBy=AMAZON,MERCHANT` (maps `AFN`/`FBA` → `AMAZON`, `MFN`/`FBM` → `MERCHANT`; validates enum) |
| **Orders `searchOrders`** | `pageSize=50` (clamped silently) | `maxResultsPerPage=50` (strictly validated integer `1..100`; accepts legacy `options.pageSize`) |
| **Orders `searchOrders`** | `pageToken=...` | `paginationToken=...` (reads `pagination.nextToken`; accepts legacy `pageToken`/`nextToken`; loop-guarded in sync) |
| **Orders `searchOrders` / `getOrder`** | Silently swallowed HTTP `400`/`404` into `{ orders: [] }` / `null` | Throws structured secret-safe error with `status`, `code`, `amazonErrorCode`, `amazonErrorMessage`, `diagnostics` |
| **Listings `searchListingsItems`** | `pageSize` clamped `1..50`; HTTP `400`/`404` swallowed into `{ items: [] }` | Strictly validates `pageSize` integer `1..20` (`400 INVALID_PAGE_SIZE`); throws structured `diagnostics` on `400`/`404` |
| **Finances `getOrderFinancialEvents`** | Single-page GET only (ignored `NextToken` & `MaxResultsPerPage`) | Full `NextToken` multi-page merge with `MaxResultsPerPage` (`1..100`), `REPEATED_NEXT_TOKEN` + `MAX_PAGES_REACHED` loop protection, structured `_diagnostics`, explicit `refundDoesNotImplyPhysicalReturn: true` |
| **Pricing `getItemOffers` / `getListingOffers`** | Raw error thrown without diagnostics; no `CustomerType` option | Returns secret-safe `diagnostics` on success; throws classified structured error (`MARKETPLACE_REGION_MISMATCH`, `PRICING_BAD_REQUEST`, `SP_API_FORBIDDEN`, `RATE_LIMITED`, `LWA_UNAUTHORIZED`) |

---

## 4. Tests Executed & Actual Results (Mocked / Offline Unit & Regression Suites)

> **Important:** All test runs below are **mocked/offline automated tests** (zero live Amazon Production or Sandbox HTTP calls were executed during Phase 2B.6). They verify contract compliance, pagination, error handling, security, and regression protection — not live Production or Sandbox seller data.

| Suite / Command | Result |
| --- | --- |
| `node --test backend/tests/amazonPhase2B6ContractCompliance.test.js` | **7 passed, 0 failed** |
| `node --test backend/tests/amazonPhase2B4CatalogFixtures.test.js` | **5 passed, 0 failed** |
| `node --test backend/tests/amazonPhase2B3CatalogDiscovery.test.js` | **8 passed, 0 failed** |
| `node --test backend/tests/amazonPhase2B1StaticSandboxMock.test.js` | **9 passed, 0 failed** |
| `node --test backend/tests/amazonPhase2BSandboxOAuth.test.js` | **13 passed, 0 failed** |
| `node --test backend/tests/amazonPhase2ASecurity.test.js` | **13 passed, 0 failed** |
| `node --test backend/tests/amazonListingAlignment.test.js` | **14 passed, 0 failed** |
| `node --test backend/tests/marketplaceNavigationSecurity.test.js` | **20 passed, 0 failed** |
| `node backend/validate_amazon_env.js` | **PASS (exit 0)** |
| `node backend/test_amazon_lwa.js` | **10 passed, 0 failed** |
| `node backend/test_amazon_connection.js` | **16 passed, 0 failed** |
| `node backend/test_amazon_sync.js` | **7 passed, 0 failed** |
| `node backend/test_amazon_inventory_pricing.js` | **16 passed, 0 failed** |
| `node backend/test_amazon_orders.js` | **18 passed, 0 failed** |
| `node backend/test_amazon_task7.js` | **14 passed, 0 failed** |
| `node backend/test_amazon_task9.js` | **16 passed, 0 failed** |
| `node backend/test_amazon_task9_3.js` | **7 passed, 0 failed** |
| `npm --prefix frontend run build` (`vite build`) | **PASS (exit 0, 1598 modules built)** |

**Total Automated Assertions:** **193 / 193 PASSED (0 FAILED)** + environment validator PASS + frontend production build PASS.

---

## 5. Remaining Limitations

1. **No Live Sandbox Verification of Orders, Listings, Finances, or Pricing Endpoints:** Official Amazon SP-API OpenAPI models still contain **zero India (`A21TJRUUN4KGV`) static fixtures** across all 6 audited APIs; real India seller data validation requires real Production SP-API seller authorization when ready.
2. **Physical Returns Visibility:** Financial refund events from Finances API `v0` do **not** prove physical returns. Complete FBA/MFN physical return feeds require future Reports API integration (`GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA` / `GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE`), intentionally out of scope for Phase 2B.6.
3. **Sync Services Require `CONNECTED`:** `syncAmazonOrdersService`, `syncAmazonInventoryService`, `syncAmazonPricingService`, and `syncAmazonSellerListingsService` remain intentionally gated on `connection.status === 'CONNECTED'` (real seller authorization), not `SANDBOX_TRANSPORT_VERIFIED`.

---

## 6. Safety & Scope Confirmation

- **No Production API calls occurred.**
- **No marketplace write operations occurred** (all audited/updated operations are strictly read-only `GET`, and Production listing publishing remains hard-blocked).
- **India marketplace (`A21TJRUUN4KGV`) and EU region (`eu`) remain strictly preserved.**
- **Tenant isolation, AES-256-GCM encryption, and secret redaction remain intact** (zero tokens or secrets appear in logs, error payloads, or reports).
- **`AiModule/`, `.env`, credentials, database records, Flipkart/Meesho/Shopify, and git state were untouched.**
