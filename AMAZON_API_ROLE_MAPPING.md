# Amazon SP-API Role & Permission Mapping Specification

**Target Platform**: AI Seller Management Platform  
**Integration Version**: SP-API Modern Architecture (v2026-01-01 / v2022-04-01 / v2021-08-01 / v0)  
**Security Posture**: Strictly READ-ONLY Operations  

---

## 1. Implemented Features to Official SP-API Roles Mapping

| Platform Module | Feature / Operation | SP-API Endpoint & Version | SP-API Operation Name | Required Developer Role | Restricted PII Required? | Read / Write | Production Approval Dependency |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **Authentication** | Seller OAuth Consent | `https://sellercentral.amazon.in/apps/authorize/consent` | OAuth 2.0 Consent Flow | None (Standard LWA) | No | Read | Valid LWA Client Profile & App Registration |
| **Authentication** | LWA Token Exchange | `POST https://api.amazon.com/auth/o2/token` | LWA Token Exchange | None (Standard LWA) | No | Read | Valid App Client ID & Secret |
| **Catalog** | Catalog Search | `GET /catalog/2022-04-01/items` | `searchCatalogItems` | **Product Listing** | No | **Read-Only** | Developer Registration Approval |
| **Catalog** | Catalog Item Details | `GET /catalog/2022-04-01/items/{asin}` | `getCatalogItem` | **Product Listing** | No | **Read-Only** | Developer Registration Approval |
| **Listings** | Seller Listings Discovery | `GET /listings/2021-08-01/items/{sellerId}/{sku}` | `getListingsItem` | **Product Listing** | No | **Read-Only** | Developer Registration Approval |
| **Inventory** | FBA Inventory Summaries | `GET /fba/inventory/v1/summaries` | `getInventorySummaries` | **Inventory and Order Tracking** | No | **Read-Only** | Developer Registration Approval |
| **Inventory** | FBM Merchant Inventory | `GET /listings/2021-08-01/items/{sellerId}/{sku}` | `getListingsItem` (attributes.fulfillment_availability) | **Product Listing** | No | **Read-Only** | Developer Registration Approval |
| **Pricing** | Competitive Pricing & Offers | `GET /products/pricing/v0/items/{Asin}/offers` | `getItemOffers` | **Pricing** | No | **Read-Only** | Developer Registration Approval |
| **Pricing** | Listing Offers & Buy Box | `GET /products/pricing/v0/listings/{SellerSKU}/offers` | `getListingOffers` | **Pricing** | No | **Read-Only** | Developer Registration Approval |
| **Orders** | Orders Search & List | `GET /orders/2026-01-01/orders` | `searchOrders` | **Inventory and Order Tracking** | No | **Read-Only** | Developer Registration Approval |
| **Orders** | Order Details & Item Specs | `GET /orders/2026-01-01/orders/{orderId}` | `getOrder` (includedData=orderItems,buyer,fulfillment) | **Inventory and Order Tracking** | No | **Read-Only** | Developer Registration Approval |
| **Finances** | Refund Events & Financial Adjustments | `GET /finances/v0/orders/{orderId}/financialEvents` | `listFinancialEventsByOrderId` | **Finance and Accounting** | No | **Read-Only** | Developer Registration Approval |
| **Returns** | Returns Visibility (Derived) | Consolidated Orders + Finances APIs | Inferred from Order Status + `RefundEventList` | **Inventory and Order Tracking** + **Finance and Accounting** | No | **Read-Only** | Developer Registration Approval |
| **Returns** | FBA Customer Returns Report | Reports API (`POST /reports/2021-06-30/reports`) | `createReport` (`GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA`) | **Inventory and Order Tracking** | No | **Read-Only** | Historical Reconciliation (Optional Phase) |

---

## 2. Unimplemented / Out-of-Scope Write Operations

The following write operations are strictly **NOT implemented** on this platform to maintain our read-only architecture and avoid write-risk liabilities:

| Future Operation | SP-API Endpoint | Required Role | Reason for Exclusion |
| :--- | :--- | :--- | :--- |
| **Product Listing Creation** | `PUT /listings/2021-08-01/items/{sellerId}/{sku}` | Product Listing | Write Mutation; out of scope for read-only sync. |
| **Inventory Quantity Updates** | `PATCH /listings/2021-08-01/items/{sellerId}/{sku}` | Product Listing | Write Mutation; prevents accidental marketplace stock overwrites. |
| **Price Updates** | `PATCH /listings/2021-08-01/items/{sellerId}/{sku}` | Pricing / Product Listing | Write Mutation; prevents unauthorized seller price overrides. |
| **Order Cancellation** | `POST /orders/v0/orders/{orderId}/cancel` | Direct-to-Consumer Shipping | Write Mutation; reserved for merchant direct action. |
| **Shipment Confirmation** | `POST /orders/2026-01-01/orders/{orderId}/shipmentConfirmations` | Direct-to-Consumer Shipping | Write Mutation; merchant logistics responsibility. |
| **Return Approval / Rejection** | No direct REST endpoint; Seller Central | N/A | Strictly seller-exclusive merchant action. |
| **Refund Issuance** | No direct REST endpoint; Seller Central | N/A | Financial write mutation; prohibited by platform policy. |

---

## 3. Required Developer Roles Summary for Amazon Application Registration

When creating the application profile in Amazon Developer Central, check only the following 3 roles:

### 1. **Inventory and Order Tracking**
- **Purpose**: Retrieve order summaries, item specifications, fulfillment channels (FBA/FBM), tracking numbers, and FBA inventory summaries.
- **Justification**: Needed to aggregate omnichannel order reporting and prevent overselling across connected channels.
- **Restricted Data Token (RDT) Required**: **NO** (our app requests non-PII anonymized orders without buyer personal identification data).

### 2. **Product Listing**
- **Purpose**: Discover seller listings, ASINs, merchant SKUs, catalog item specifications, and FBM merchant stock quantities.
- **Justification**: Needed to map internal multi-channel product catalogs to external Amazon seller listings.
- **Restricted Data Token (RDT) Required**: **NO**.

### 3. **Pricing**
- **Purpose**: Fetch real-time Buy Box prices, competitive lowest offers, and seller listing prices.
- **Justification**: Powers the platform's competitive pricing analytics dashboard.
- **Restricted Data Token (RDT) Required**: **NO**.

### 4. **Finance and Accounting**
- **Purpose**: Fetch verified financial refund events (`RefundEventList`), shipment charge adjustments, and transaction dates.
- **Justification**: Enables automated refund accounting reconciliation and returns visibility without performing financial mutations.
- **Restricted Data Token (RDT) Required**: **NO**.

---

## 4. Roles Specifically NOT Requested
- **Direct-to-Consumer Shipping**: NOT requested. This role grants access to customer real names, phone numbers, and physical residential delivery addresses. Requesting this role triggers stringent third-party security audits, ISO 27001 / SOC 2 certification reviews, and data loss prevention mandates that are unnecessary for analytics and inventory tracking.
- **Buyer Communication / Messaging**: NOT requested.
- **Amazon Business / B2B Invoicing**: NOT requested.
