# Phase 2B.5 — Amazon Sandbox API Coverage Audit (Read-Only)

**Audit Date:** 2026-11-21  
**Target Configuration:** Environment = `sandbox` | Region = `eu` (`https://sandbox.sellingpartnerapi-eu.amazon.com`) | Target Marketplace = India (`A21TJRUUN4KGV`)  
**Connection Baseline (Verified in Phase 2B.2):** `SANDBOX_TRANSPORT_VERIFIED` (`verificationMode: SANDBOX_STATIC_MOCK`, `lwaVerified: true`, `sandboxTransportVerified: true`, `sellerAuthorizationVerified: false`, `indiaMarketplaceAuthorized: false`).  
**Audit Mode:** Strictly read-only inspection of repository source code, existing automated test suites, live Sandbox evidence from Phases 2B.2–2B.4, and official Amazon OpenAPI models (`amzn/selling-partner-api-models`). Zero source code, UI, `.env`, credentials, or database records were modified.

---

## Executive Summary

1. **Zero India (`A21TJRUUN4KGV`) Static Sandbox Fixtures Across All 6 Audited SP-API Models:** Direct inspection of Amazon's official OpenAPI specifications in `amzn/selling-partner-api-models` confirms that **none** of the 6 audited APIs (`Orders v2026-01-01`, `FBA Inventory v1`, `Listings Items v2021-08-01`, `Product Pricing v0`, `Finances v0`, `Catalog Items v2022-04-01`) provide India (`A21TJRUUN4KGV`) Static Sandbox fixtures or Dynamic Sandbox support.
2. **Region Enforcement Blocks US Fixtures on EU Sandbox:** Live probes in Phase 2B.4 proved that sending documented NA/US fixtures (`ATVPDKIKX0DER`) to the EU Sandbox endpoint (`https://sandbox.sellingpartnerapi-eu.amazon.com`) is rejected by Amazon with `HTTP 403 Unauthorized` (`"The marketplaces you provided are not valid for region."`). Target marketplace must remain **India (`A21TJRUUN4KGV`)** on **EU (`eu`)**.
3. **Contract Discrepancies Identified (Audit Findings — Not Yet Modified):**
   - **Orders API `v2026-01-01` (`amazon.order.service.js`):** Sends `orderStatuses`, `fulfillmentChannels`, `pageSize`, and `pageToken`, whereas official `orders_2026-01-01.json` specifies `fulfillmentStatuses`, `fulfilledBy`, `maxResultsPerPage`, and `paginationToken`. Also swallows HTTP `400`/`404` into `{ orders: [] }` without surfacing diagnostics.
   - **Listings Items API `v2021-08-01` (`amazon.listings.service.js`):** `searchListingsItems` allows `pageSize` up to `50` (official spec max is `20`) and swallows HTTP `400`/`404` without structured diagnostics.
   - **Sync Services Gate on `CONNECTED`:** `syncAmazonOrdersService`, `syncAmazonInventoryService`, `syncAmazonPricingService`, and `syncAmazonSellerListingsService` require `connection.status === 'CONNECTED'`, which intentionally prevents seller-specific data sync on `SANDBOX_TRANSPORT_VERIFIED` connections until real seller authorization exists.
4. **Live Sandbox vs. Mocked Evidence Separation:**
   - **Live EU Sandbox HTTP calls executed so far:** Sellers API v1 (`HTTP 200` static mock, 2 calls in Phase 2B.2) and Catalog Items v2022-04-01 (`HTTP 400` static no-match for India & `HTTP 403` region mismatch for US, 8 calls in Phases 2B.3–2B.4).
   - **Not yet live-tested against EU Sandbox:** Orders, FBA Inventory, Listings Items, Product Pricing, and Finances APIs (automated tests for those 5 APIs are 100% mocked/offline).

---

## Detailed Per-API Audit

---

### 1. Orders API

- **Official API Version & Endpoints:**
  - `Orders API v2026-01-01` (`models/orders-api-model/orders_2026-01-01.json`)
  - `GET /orders/2026-01-01/orders` (`searchOrders`)
  - `GET /orders/2026-01-01/orders/{orderId}` (`getOrder`) — consolidated order + line items (no separate `/orderItems` endpoint in `v2026-01-01`).
- **Officially Documented Sandbox Support:** **Static Sandbox ONLY** (`dynamic: false`).
- **Available Static Sandbox Fixtures (`orders_2026-01-01.json`):**
  - `searchOrders` (`200`): 3 fixtures — JP (`A1VC38T7YXB528`, `createdAfter=2024-12-25T00:00:00Z`), UK (`A1F83G8C2ARO7P`, `createdAfter=2024-12-23T00:00:00Z`, `paginationToken=9ZhB4RmVyc2lvbiAxLjAgb2YgdGhl`), BR (`A2Q3Y263D00KWC`, `createdAfter=2024-12-20T00:00:00Z`); plus 1 `400` (`createdAfter=TEST_CASE_400`). **Zero India (`A21TJRUUN4KGV`) fixtures.**
  - `getOrder` (`200`): 3 fixtures (`orderId=171-9876543-2109876`, `028-1234567-8901234`, `114-9876543-1234567`) + 1 `400` (`orderId=TEST_CASE_400`).
- **Required Request Parameters (Official `orders_2026-01-01.json`):**
  - `searchOrders`: None strictly required in schema, though practical queries use `marketplaceIds`, `createdAfter` or `lastUpdatedAfter`, `fulfillmentStatuses`, `fulfilledBy`, `includedData`, `maxResultsPerPage`, `paginationToken`.
  - `getOrder`: `orderId` (path, required); `includedData` (query, optional).
- **Current Implementation Contract Audit (`backend/src/integrations/marketplaces/amazon/amazon.order.service.js`):**
  - **Matches:** Endpoint paths (`/orders/2026-01-01/orders`, `/orders/2026-01-01/orders/{orderId}`), no invented `/orderItems` endpoint, strict PII omission (`shippingAddress: null` when unrequested), distributed lock + heartbeat, rate-limit 429 retry, read-only enforcement.
  - **Contract Mismatches Found (4):**
    1. Sends `orderStatuses` instead of official `fulfillmentStatuses` (`amazon.order.service.js:72`).
    2. Sends `fulfillmentChannels` instead of official `fulfilledBy` (`amazon.order.service.js:79`).
    3. Sends `pageSize` instead of official `maxResultsPerPage` (`amazon.order.service.js:90`).
    4. Sends `pageToken` instead of official `paginationToken` (`amazon.order.service.js:93-95`).
  - **Diagnostics Gap:** `searchAmazonOrders` catches HTTP `400`/`404` and returns `{ orders: [] }` without returning `httpStatus`, `requestId`, or `errorCode` (`amazon.order.service.js:114-121`).
- **Existing Automated Tests & Coverage (Mocked / Offline):**
  - `backend/test_amazon_orders.js`: **18/18 passed** (status mapping, null address PII safety, `v2026-01-01` paths, distributed lock lease/heartbeat, 429 retry/backoff, POS partial index).
  - `backend/test_amazon_task7.js`: **14/14 passed** (order item mapping, refund extraction, tenant isolation, read-only checks).
- **Live Sandbox HTTP Executed?** **No.**
- **Actual Response Status & Evidence:** None yet.
- **What Can vs. Cannot Be Verified in Sandbox:**
  - *Can verify in Sandbox:* Parameter contract alignment, LWA + EU Sandbox HTTP transport, HTTP `400` negative fixture (`createdAfter=TEST_CASE_400` / `orderId=TEST_CASE_400`), and `getOrder` static fixture parsing (non-India static orders).
  - *Cannot verify in Sandbox:* Real India (`A21TJRUUN4KGV`) order retrieval, incremental `lastUpdatedAfter` cursor pagination across live orders, real fulfillment channel distribution, or RDT/restricted buyer data policies.
- **Requires Real Production Seller Authorization:** Live India (`A21TJRUUN4KGV`) order sync, real order status transitions, pagination over actual seller orders, and Direct-to-Consumer / Orders role approval.

---

### 2. Inventory API (FBA Inventory v1 + FBM via Listings Items)

- **Official API Version & Endpoints:**
  - `FBA Inventory API v1` (`models/fba-inventory-api-model/fbaInventory.json`)
  - `GET /fba/inventory/v1/summaries` (`getInventorySummaries`) — strictly read-only in our app (`POST /fba/inventory/v1/items`, `DELETE`, `addInventory` are intentionally NOT used).
  - FBM stock is derived read-only from Listings Items `v2021-08-01` `fulfillmentAvailability`.
- **Officially Documented Sandbox Support:** **None in OpenAPI model** (`dynamic: false`, `staticFixtures: []` for all operations in `fbaInventory.json`).
- **Available Static Sandbox Fixtures:** **None (0 static fixtures for any marketplace, including India `A21TJRUUN4KGV`).**
- **Required Request Parameters (`getInventorySummaries`):**
  - `granularityType` (query, required — `'Marketplace'`)
  - `granularityId` (query, required — `'A21TJRUUN4KGV'`)
  - `marketplaceIds` (query, required — `'A21TJRUUN4KGV'`)
  - Optional: `details`, `startDateTime`, `sellerSkus`, `sellerSku`, `nextToken`.
- **Current Implementation Contract Audit (`backend/src/integrations/marketplaces/amazon/amazon.inventory.service.js`):**
  - **Matches:** Exact path `/fba/inventory/v1/summaries`, all 3 required query params (`granularityType=Marketplace`, `granularityId`, `marketplaceIds`) + `details=true`, `sellerSkus`, and `nextToken` pagination; returns structured `diagnostics` (`httpStatus`, `requestId`, `errorCode`) without faking inventory; preserves master `Product.stock` immutability; strictly read-only (`updateAmazonInventory` throws read-only rejection).
  - **Minor Note:** `syncAmazonInventoryService` creates `AmazonSpApiClient` without explicitly passing `sandbox: connection.environment === 'sandbox'` (relies on env default) and gates on `connection.status === 'CONNECTED'`.
- **Existing Automated Tests & Coverage (Mocked / Offline):**
  - `backend/test_amazon_inventory_pricing.js`: **16/16 passed** (FBA/FBM mappers, `MarketplaceInventory` compound index, pagination, empty `200` handling, `403`/`400` error diagnostics, read-only enforcement).
- **Live Sandbox HTTP Executed?** **No.**
- **Actual Response Status & Evidence:** None yet.
- **What Can vs. Cannot Be Verified in Sandbox:**
  - *Can verify in Sandbox:* Authenticated EU Sandbox transport to `/fba/inventory/v1/summaries` and clean handling of Sandbox empty/`400`/`403` error responses with real `x-amzn-RequestId`.
  - *Cannot verify in Sandbox:* Real FBA fulfillable/inbound/reserved/unfulfillable inventory summaries or multi-page `nextToken` traversal against real India (`A21TJRUUN4KGV`) SKUs (zero official fixtures exist).
- **Requires Real Production Seller Authorization:** Real India FBA inventory summaries, real FBM `fulfillmentAvailability` quantities, and real SKU-to-master-product reconciliation.

---

### 3. Listings Items API (+ Product Type Definitions Companion)

- **Official API Version & Endpoints:**
  - `Listings Items API v2021-08-01` (`models/listings-items-api-model/listingsItems_2021-08-01.json`)
    - `GET /listings/2021-08-01/items/{sellerId}/{sku}` (`getListingsItem`)
    - `GET /listings/2021-08-01/items/{sellerId}` (`searchListingsItems`)
    - `PUT /listings/2021-08-01/items/{sellerId}/{sku}` (`putListingsItem` — guarded, supports `mode=VALIDATION_PREVIEW`, production hard-blocked)
  - Companion read-only schema API: `Product Type Definitions API v2020-09-01` (`GET /definitions/2020-09-01/productTypes`, `GET /definitions/2020-09-01/productTypes/{productType}`).
- **Officially Documented Sandbox Support:** **Static Sandbox ONLY** (`dynamic: false`).
- **Available Static Sandbox Fixtures (`listingsItems_2021-08-01.json`):**
  - `getListingsItem`: 1 generic `200` fixture (`body: {}`), 1 `400` (`sku=BadSKU`).
  - `searchListingsItems`: 1 `200` fixture (`identifiersType=SKU`, `identifiers=GM-ZDPI-9B4E,HW-ZDPI-9B4E,TC-ZDPI-9B4E`, `marketplaceIds=ATVPDKIKX0DER,A2EUQ1WTGCTBG2` — **US+CA only**, `pageSize=1`) + 1 `400` (`sellerId=SellerId`, `marketplaceIds=invalid`). **Zero India (`A21TJRUUN4KGV`) search fixtures.**
  - `putListingsItem`: 1 generic `200` fixture, 2 `VALIDATION_PREVIEW` fixtures (`sku=VALIDATION_VALID` / `VALIDATION_INVALID`, `marketplaceIds=ATVPDKIKX0DER` — **US only**), 1 `400` (`sku=BadSKU`).
- **Required Request Parameters:**
  - `getListingsItem`: `sellerId` (path), `sku` (path), `marketplaceIds` (query).
  - `searchListingsItems`: `sellerId` (path), `marketplaceIds` (query); optional: `identifiers`, `identifiersType`, `includedData`, `pageSize` (max `20`), `pageToken`.
  - `putListingsItem`: `sellerId` (path), `sku` (path), `marketplaceIds` (query), `body` (`productType`, `requirements`, `attributes`).
- **Current Implementation Contract Audit (`amazon.listings.service.js`, `amazon.publisher.service.js`, `amazon.definitions.service.js`, `amazon.sync.service.js`):**
  - **Matches:** Official `v2021-08-01` paths; `executeListingSubmission` enforces real `connection.sellingPartnerId` (never internal MongoDB `sellerId` or mock IDs), validates Product Type JSON Schema with TTL caching, rejects HTTP `200` with `status: 'INVALID'` or `ERROR` issues, never fabricates `amazonSubmissionId`, preserves all 13 master `Product` fields, and hard-blocks Production publishing.
  - **Contract Discrepancies Found (2):**
    1. `searchListingsItems` (`amazon.listings.service.js:135`) caps `pageSize` at `50`, whereas official `listingsItems_2021-08-01.json` restricts `pageSize` to `1..20`.
    2. `searchListingsItems` (`amazon.listings.service.js:158-167`) silently converts HTTP `400`/`404` into `{ items: [] }` without attaching structured `diagnostics` (`httpStatus`, `requestId`, `errorCode`).
- **Existing Automated Tests & Coverage (Mocked / Offline):**
  - `backend/test_amazon_sync.js` (**7/7**), `backend/test_amazon_task9.js` (**16/16**), `backend/test_amazon_task9_3.js` (**7/7**), `backend/tests/amazonListingAlignment.test.js` (**14/14**), `backend/tests/marketplaceNavigationSecurity.test.js` (**20/20**), `backend/tests/amazonPhase2BSandboxOAuth.test.js` (**13/13**).
- **Live Sandbox HTTP Executed?** **No.**
- **Actual Response Status & Evidence:** None yet.
- **What Can vs. Cannot Be Verified in Sandbox:**
  - *Can verify in Sandbox:* Read-only `GET /listings/2021-08-01/items/{sellerId}/{sku}` transport and `BadSKU` error fixture, Product Type Definitions transport/fallback behavior, and local JSON Schema / dry-run validation.
  - *Cannot verify in Sandbox:* Real India (`A21TJRUUN4KGV`) seller SKU discovery via `searchListingsItems`, India-specific `VALIDATION_PREVIEW` attribute rules, or real live listing creation/offers.
- **Requires Real Production Seller Authorization:** Real seller SKU sync (`A21TJRUUN4KGV`), live Product Type JSON Schemas for India categories, and real `VALIDATION_PREVIEW` / publishing against a real merchant token (`sellingPartnerId`).

---

### 4. Pricing API

- **Official API Version & Endpoints:**
  - `Product Pricing API v0` (`models/product-pricing-api-model/productPricingV0.json`) — currently implemented:
    - `GET /products/pricing/v0/items/{Asin}/offers` (`getItemOffers`)
    - `GET /products/pricing/v0/listings/{SellerSKU}/offers` (`getListingOffers`)
  - *(Newer `Product Pricing API v2022-05-01` batch endpoints `getFeaturedOfferExpectedPriceBatch` and `getCompetitiveSummary` exist in SP-API models but are not currently implemented.)*
- **Officially Documented Sandbox Support:** **Static Sandbox ONLY** (`dynamic: false`).
- **Available Static Sandbox Fixtures (`productPricingV0.json`):**
  - `getItemOffers`: `Asin=B00V5DG6IQ`, `MarketplaceId=ATVPDKIKX0DER` (**US only**) + `400` (`Asin=TEST_CASE_400`).
  - `getListingOffers`: `SellerSKU=NABetaASINB00V5DG6IQ`, `MarketplaceId=ATVPDKIKX0DER` (**US only**) + `400` (`SellerSKU=TEST_CASE_400`).
  - **Zero India (`A21TJRUUN4KGV`) or EU-region fixtures.**
- **Required Request Parameters:**
  - `getItemOffers`: `Asin` (path), `MarketplaceId` (query, PascalCase), `ItemCondition` (query, PascalCase).
  - `getListingOffers`: `SellerSKU` (path), `MarketplaceId` (query, PascalCase), `ItemCondition` (query, PascalCase).
- **Current Implementation Contract Audit (`backend/src/integrations/marketplaces/amazon/amazon.pricing.service.js`):**
  - **Matches:** Official `v0` paths and exact PascalCase query parameter names (`MarketplaceId`, `ItemCondition`), strictly read-only, persists snapshots to separate `MarketplacePricing` collection without mutating `Product.masterPrice`.
  - **Minor Gaps Noted:** Does not expose optional `CustomerType` (`Consumer`/`Business`) or return structured `diagnostics` (`httpStatus`, `requestId`) from `getItemOffers`/`getListingOffers`; `syncAmazonPricingService` gates on `connection.status === 'CONNECTED'`.
- **Existing Automated Tests & Coverage (Mocked / Offline):**
  - `backend/test_amazon_inventory_pricing.js`: **16/16 passed** (offer mapping, Buy Box vs own price vs lowest offer separation, missing Buy Box handling, `MarketplacePricing` unique index).
- **Live Sandbox HTTP Executed?** **No.**
- **Actual Response Status & Evidence:** None yet.
- **What Can vs. Cannot Be Verified in Sandbox:**
  - *Can verify in Sandbox:* Authenticated EU Sandbox HTTP transport and clean `400`/`403` error handling (`TEST_CASE_400` / unmatched India ASIN).
  - *Cannot verify in Sandbox:* Real INR pricing, Buy Box winner, or competitive offer snapshots for India (`A21TJRUUN4KGV`) — all `v0` static fixtures are US `ATVPDKIKX0DER` only (rejected with HTTP `403` region mismatch on EU Sandbox).
- **Requires Real Production Seller Authorization:** Live India (`A21TJRUUN4KGV`) Buy Box, landed INR prices, and competitor offers for real seller ASINs/SKUs (plus Pricing role authorization).

---

### 5. Finances / Refunds / Returns APIs

- **Official API Version & Endpoints:**
  - `Finances API v0` (`models/finances-api-model/financesV0.json`):
    - Implemented: `GET /finances/v0/orders/{orderId}/financialEvents` (`listFinancialEventsByOrderId`, called via `AmazonSpApiClient.getOrderFinancialEvents` in `backend/src/integrations/marketplaces/amazon/amazon.client.js:311-330`).
    - Not implemented: `listFinancialEventGroups`, `listFinancialEventsByGroupId`, `listFinancialEvents`, and newer `Finances API v2024-06-19` (`listTransactions`, `listBalances`, `listSummary`).
  - **Returns API Status:** Amazon SP-API does **not** have a standalone Returns REST API (Amazon exposes returns via Reports API `GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA` / `GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE`, not yet implemented). Our `getAmazonReturnsService` / `syncAmazonReturnsService` (`amazon.order.service.js:953-1160`) read local `Return` records and derive refund/cancellation visibility strictly from synced `Order` + `Finances v0` `RefundEventList` data without fabricating returns.
- **Officially Documented Sandbox Support:** **Static Sandbox ONLY** (`dynamic: false`).
- **Available Static Sandbox Fixtures (`financesV0.json`):**
  - `listFinancialEventsByOrderId`: `200` (`orderId=485-734-5434857`, `MaxResultsPerPage=10`) + `400` (`orderId=BAD-ORDER`). *(No `marketplaceIds` parameter, so this static fixture is region-agnostic in parameters, though its payload is static mock USD events — NOT real India seller refunds.)*
  - `listFinancialEvents`: `200` (`MaxResultsPerPage=10`, `NextToken=jehgri34yo7jr9e8f984tr9i4o`) + `400` (`MaxResultsPerPage=2`).
- **Required Request Parameters (`listFinancialEventsByOrderId`):**
  - `orderId` (path, required); optional: `MaxResultsPerPage` (1–100), `NextToken`.
- **Current Implementation Contract Audit (`amazon.client.js:311-330`, `amazon.order.service.js`, `return.model.js`):**
  - **Matches:** Exact path `/finances/v0/orders/{orderId}/financialEvents`, strictly read-only, non-blocking handling of HTTP `403` Finance role restriction, tenant-scoped `Return` RMA uniqueness (`{ sellerId, channel, rmaNumber }` fixed in Phase 2A), zero fake return fabrication.
  - **Minor Gaps Noted:** `getOrderFinancialEvents` does not paginate `NextToken` or forward `MaxResultsPerPage`, and swallows HTTP `400`/`404` into `null` without returning structured diagnostics.
- **Existing Automated Tests & Coverage (Mocked / Offline):**
  - `backend/test_amazon_task7.js`: **14/14 passed** (`RefundEventList` parsing, zero-refund handling, `Return` schema, read-only enforcement, tenant filtering).
  - `backend/tests/amazonPhase2ASecurity.test.js`: Test `4.3` passed (tenant-scoped RMA compound uniqueness).
- **Live Sandbox HTTP Executed?** **No.**
- **Actual Response Status & Evidence:** None yet.
- **What Can vs. Cannot Be Verified in Sandbox:**
  - *Can verify in Sandbox:* Authenticated EU Sandbox transport to `/finances/v0/orders/{orderId}/financialEvents`, static `orderId=485-734-5434857` / `BAD-ORDER` parsing, and `403` Finance-role-missing fallback.
  - *Cannot verify in Sandbox:* Real INR refund events, real settlement fees, or FBA/MFN customer return reports for India (`A21TJRUUN4KGV`).
- **Requires Real Production Seller Authorization:** Finance and Accounting role approval, real India order financial/refund events, and Reports API integration for full FBA/MFN return reports.

---

### 6. Catalog Items API

- **Official API Version & Endpoints:**
  - `Catalog Items API v2022-04-01` (`models/catalog-items-api-model/catalogItems_2022-04-01.json`)
  - `GET /catalog/2022-04-01/items` (`searchCatalogItems`)
  - `GET /catalog/2022-04-01/items/{asin}` (`getCatalogItem`)
- **Officially Documented Sandbox Support:** **Static Sandbox ONLY** (`dynamic: false`).
- **Available Static Sandbox Fixtures (`catalogItems_2022-04-01.json`):**
  - `searchCatalogItems` (`200`): `keywords=samsung,tv`, `marketplaceIds=ATVPDKIKX0DER` (**US only**), `includedData=classifications,dimensions,identifiers,images,productTypes,relationships,salesRanks,summaries,vendorDetails` → ASIN `B07N4M94X4`.
  - `getCatalogItem` (`200`): `asin=B07N4M94X4`, `marketplaceIds=ATVPDKIKX0DER` (**US only**), same 9 `includedData` → ASIN `B07N4M94X4`.
  - **Zero India (`A21TJRUUN4KGV`) or EU-region fixtures.**
- **Required Request Parameters:**
  - `searchCatalogItems`: `marketplaceIds` (required) + mutually exclusive `keywords` (comma-delimited, max 20) OR `identifiers` + `identifiersType` (`SKU` also requires `sellerId`); optional: `includedData` (valid v2022-04-01 enums), `pageSize` (1–20), `pageToken`.
  - `getCatalogItem`: `asin` (path, required), `marketplaceIds` (query, required); optional: `includedData`, `locale`.
- **Current Implementation Contract Audit (`backend/src/integrations/marketplaces/amazon/amazon.catalog.service.js`):**
  - **Fully Compliant (hardened in Phases 2B.3 & 2B.4):** Comma-delimited keyword serialization, mutual exclusivity validation, enum validation, `sellingPartnerId` requirement for `SKU`, India `A21TJRUUN4KGV` preservation, structured secret-safe diagnostics, and explicit distinction between `UNSUPPORTED_SANDBOX_QUERY` (`SANDBOX_CATALOG_STATIC_NO_MATCH`) vs. `API_FAILURE` (`MARKETPLACE_REGION_MISMATCH`, `LWA_UNAUTHORIZED`, `SP_API_FORBIDDEN`, `RATE_LIMITED`, `NETWORK_FAILURE`).
- **Existing Automated Tests & Coverage (Mocked / Offline):**
  - `backend/tests/amazonPhase2B3CatalogDiscovery.test.js`: **8/8 passed**
  - `backend/tests/amazonPhase2B4CatalogFixtures.test.js`: **5/5 passed**
  - `backend/test_amazon_sync.js`: **7/7 passed**
- **Live Sandbox HTTP Executed?** **Yes — 8 live read-only EU Sandbox HTTP requests executed in Phases 2B.3 & 2B.4.**
- **Actual Response Status & Evidence:**
  - `GET /catalog/2022-04-01/items` (`marketplaceIds=A21TJRUUN4KGV`, `keywords=wireless,earbuds`): **HTTP 400** `InvalidInput: "Could not match input arguments"` (`329 ms`, `x-amzn-RequestId: 60894653-15e1-4ce3-8000-f06ad544ca65`)
  - `GET /catalog/2022-04-01/items` (`marketplaceIds=A21TJRUUN4KGV`, `keywords=samsung,tv`): **HTTP 400** `InvalidInput: "Could not match input arguments"` (`650 ms`, `x-amzn-RequestId: 358697f5-d67e-4aed-bce3-8a0aa5c62d60`)
  - `GET /catalog/2022-04-01/items/B07N4M94X4` (`marketplaceIds=A21TJRUUN4KGV`): **HTTP 400** `InvalidInput: "Could not match input arguments"` (`257 ms`, `x-amzn-RequestId: 7334902f-6354-4b0d-9912-cd05c493f958`)
  - `GET /catalog/2022-04-01/items` & `/items/B07N4M94X4` (`marketplaceIds=ATVPDKIKX0DER` on EU host): **HTTP 403** `Unauthorized: "The marketplaces you provided are not valid for region."` (`x-amzn-RequestId: a4c69a33-eed3-4a4f-ad13-d3127562826e`, `6d353235-4cb2-4cf2-80a0-7ffe7ece52f4`)
- **What Can vs. Cannot Be Verified in Sandbox:**
  - *Can verify in Sandbox:* Parameter validation, LWA auth + EU Sandbox transport, `HTTP 400` Static Sandbox no-match classification, and `HTTP 403` region mismatch detection.
  - *Cannot verify in Sandbox:* Any HTTP `200` catalog product discovery results on EU Sandbox (no India/EU fixtures exist, and US fixtures are blocked by EU region validation).
- **Requires Real Production Seller Authorization:** Live India (`A21TJRUUN4KGV`) keyword & ASIN/EAN/UPC catalog discovery.

---

## Companion Baseline Reference (Verified in Phase 2B.2)

- **Sellers API v1 (`GET /sellers/v1/marketplaceParticipations`):** Live-verified on EU Sandbox with 2 real HTTP `200` calls (`x-amzn-RequestId: 03f57540-6f1f-4cc0-bfd3-6f8e994f5407` in `659 ms`, `9b8a002a-76c8-495b-9b98-8d7045615b0d` in `227 ms`). Returns Amazon's hardcoded static US mock (`ATVPDKIKX0DER` / `BestSellerStore`), truthfully classified as `SANDBOX_TRANSPORT_VERIFIED` (`SANDBOX_STATIC_MOCK`, `sellerAuthorizationVerified: false`, `indiaMarketplaceAuthorized: false`).

---

## Final Summary Matrix

| API | Implementation Status | Automated Tests | Live Sandbox Evidence | Sandbox Limitation | Production Dependency |
| --- | --- | --- | --- | --- | --- |
| **Orders API** (`v2026-01-01`) | Implemented (`amazon.order.service.js`); **4 query param mismatches** (`orderStatuses`, `fulfillmentChannels`, `pageSize`, `pageToken` vs. `fulfillmentStatuses`, `fulfilledBy`, `maxResultsPerPage`, `paginationToken`); swallows `400`/`404` without diagnostics | **32 mocked tests passed** (`test_amazon_orders.js`: 18, `test_amazon_task7.js`: 14) | **None** (0 live HTTP calls executed) | Static Sandbox only; JP/UK/BR static fixtures only; **0 India (`A21TJRUUN4KGV`) fixtures**; no real order pagination | Real India seller authorization, Orders role, live order sync & incremental `lastUpdatedAfter` verification |
| **Inventory API** (`FBA v1` + FBM via Listings) | Implemented (`amazon.inventory.service.js`); matches official `GET /fba/inventory/v1/summaries` contract with structured diagnostics; read-only | **16 mocked tests passed** (`test_amazon_inventory_pricing.js`: 16) | **None** (0 live HTTP calls executed) | **Zero static or dynamic Sandbox fixtures** in official `fbaInventory.json` for any marketplace | Real India seller authorization, Inventory role, live FBA/FBM quantities & SKU mapping |
| **Listings Items API** (`v2021-08-01`) | Implemented (`amazon.listings.service.js`, `amazon.publisher.service.js`, `amazon.definitions.service.js`); `get`/`put` compliant & guarded; **minor gaps**: `searchListingsItems` max `pageSize` is `50` (spec `20`) & swallows `400`/`404` | **77 mocked tests passed** (`test_amazon_sync`: 7, `task9`: 16, `task9_3`: 7, `Alignment`: 14, `NavSecurity`: 20, `Phase2B`: 13) | **None** (0 live HTTP calls executed) | Static Sandbox only; `searchListingsItems` & `VALIDATION_PREVIEW` fixtures are **US/CA (`ATVPDKIKX0DER`) only**; **0 India search fixtures** | Real India seller `sellingPartnerId`, Product Listing role, live India Product Type schemas & SKU sync |
| **Pricing API** (`Product Pricing v0`) | Implemented (`amazon.pricing.service.js`); matches `getItemOffers` & `getListingOffers` `v0` paths and PascalCase params; read-only; lacks structured diagnostics return | **16 mocked tests passed** (`test_amazon_inventory_pricing.js`: 16) | **None** (0 live HTTP calls executed) | Static Sandbox only; all `v0` fixtures are **US (`ATVPDKIKX0DER`) only** (rejected `403` on EU host); **0 India fixtures** | Real India seller authorization, Pricing role, live INR Buy Box & competitive offers (or future `v2022-05-01` migration) |
| **Finances / Refunds / Returns APIs** (`Finances v0` + Order-derived Returns) | Implemented (`amazon.client.js:getOrderFinancialEvents`, `amazon.order.service.js`); matches `/finances/v0/orders/{orderId}/financialEvents`; no `NextToken` pagination; no Reports API yet for full returns | **15 mocked tests passed** (`test_amazon_task7.js`: 14, `Phase2A`: 1 RMA index test) | **None** (0 live HTTP calls executed) | Static Sandbox only (`485-734-5434857` static USD mock); **no standalone Returns REST API** in SP-API | Real India seller authorization, Finance & Accounting role, live INR refunds, and Reports API for customer return feeds |
| **Catalog Items API** (`v2022-04-01`) | **Fully compliant** (`amazon.catalog.service.js`, hardened in 2B.3–2B.4); comma keywords, mutual exclusivity, enum validation, diagnostics & compatibility metadata | **20 mocked tests passed** (`Phase2B3`: 8, `Phase2B4`: 5, `test_amazon_sync`: 7) | **Yes — 8 live EU Sandbox calls** (`400 InvalidInput` for India `A21TJRUUN4KGV`: `60894653-...`, `358697f5-...`, `7334902f-...`; `403` region mismatch for US: `a4c69a33-...`, `6d353235-...`) | Static Sandbox only; ONLY 2 NA/US (`ATVPDKIKX0DER`) fixtures (`samsung,tv`, `B07N4M94X4`); **0 India/EU fixtures** | Real Production SP-API authorization for live India (`A21TJRUUN4KGV`) keyword & ASIN/EAN/UPC catalog discovery |

---

## Recommended Next Phase (Pending Your Approval)

Before touching Production, a small targeted **Phase 2B.6 — Contract Alignment & Diagnostics Hardening** would fix the exact contract bugs discovered in this audit without changing target marketplace (`A21TJRUUN4KGV`) or fabricating any responses:
1. Fix the 4 official `Orders v2026-01-01` query parameter names in `amazon.order.service.js` (`fulfillmentStatuses`, `fulfilledBy`, `maxResultsPerPage`, `paginationToken`) and preserve structured HTTP diagnostics on errors instead of silently swallowing `400`/`404`.
2. Align `searchListingsItems` `pageSize` bound (`1..20`) and preserve structured diagnostics on `400`/`404`.
3. Add structured diagnostics + optional `NextToken` pagination to `getOrderFinancialEvents` and `getItemOffers`/`getListingOffers`.
4. Optionally execute one read-only EU Sandbox transport diagnostic pass for Orders, FBA Inventory, Listings, Pricing, and Finances (keeping `A21TJRUUN4KGV` & `eu`) strictly to record real `x-amzn-RequestId` and HTTP status codes for the remaining 5 APIs.

*Audit complete. Stopping here for your review before any code changes.*
