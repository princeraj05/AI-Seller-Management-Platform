# Amazon SP-API Production Authorization Readiness Assessment

**Platform**: AI Seller Management Platform  
**Target Marketplace**: Amazon India (`Amazon.in`, Marketplace ID: `A21TJRUUN4KGV`)  
**Target SP-API Region**: Europe / India (`eu` endpoint: `https://sellingpartnerapi-eu.amazon.com`)  
**Audit Date**: November 2026  
**Status**: READINESS AUDIT COMPLETE — BLOCKED ON OFFICIAL BUSINESS VERIFICATION  

---

## 1. Overall Production Readiness Score

### **Readiness Rating: 72%**

```
[███████████████░░░░░] 72% - Core Architecture Complete, Awaiting Amazon Enterprise Verification
```

### Breakdown by Category

| Capability Pillar | Readiness | Status | Critical Dependencies |
| :--- | :---: | :---: | :--- |
| **Backend & Architecture** | **95%** | **Ready** | SP-API v2026-01-01 client, multi-tenant isolation, rate limiter & distributed locking. |
| **Security & Cryptography** | **95%** | **Ready** | AES-256-GCM token encryption, single-use signed OAuth state nonces, credential stripping. |
| **API Role Alignment** | **85%** | **Ready** | Catalog, Pricing, Inventory, Orders, and Finances mapped to documented SP-API roles. |
| **Amazon Business Profile** | **20%** | **BLOCKED** | Requires government business registration (GSTIN/PAN/CIN), registered domain email, and D-U-N-S number. |
| **App Registration & Review** | **40%** | **Pending** | Developer Central application profile submission, Data Protection Policy (DPP) compliance self-assessment. |
| **Appstore Listing** | **0%** | **Deferred** | Public listing on Amazon Selling Partner Appstore requires production vetting and live testing. |

---

## 2. Requirement Status Matrix

### A. Completed Requirements (Codebase & Technical Architecture)
- [x] **LWA OAuth 2.0 Engine**: Implemented authorization code exchange with `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, and `redirect_uri`.
- [x] **Signed & Replay-Protected State**: HMAC-SHA256 state token binding tenant ID and timestamp, backed by MongoDB atomic TTL nonce consumption (`ConsumedOAuthNonce`).
- [x] **Zero-Leakage Multi-Tenant Isolation**: Tenant identity resolved exclusively from verified JWT access tokens (`req.tenant.sellerId`). All database lookups, caches, and sync locks are strictly seller-scoped.
- [x] **At-Rest Token Encryption**: AES-256-GCM symmetric encryption for all seller refresh tokens using a dedicated `INTEGRATION_ENCRYPTION_KEY`.
- [x] **SP-API v2026-01-01 Consolidation**: Orders search and order detail queries use the current v2026-01-01 specification (`searchOrders` and `getOrder` with `includedData=orderItems`), without invoking deprecated v0 operations.
- [x] **PII Protection & Data Minimization**: Generic customer name display (`"Amazon Customer"`), omitting unrequested buyer addresses (`shippingAddress = null`) to comply with Amazon Acceptable Use Policy (AUP).
- [x] **Distributed Lock Heartbeat**: 5-minute sync lock leases with periodic renewal and lease recovery to prevent concurrent sync races across background workers.
- [x] **Exponential Backoff & Rate-Limit Engine**: Token bucket throttler with jitter and HTTP 429 `Retry-After` / `x-amzn-RateLimit-Limit` header parsing.
- [x] **Dual Environment Routing**: Clean endpoint resolution between Sandbox (`https://sandbox.sellingpartnerapi-eu.amazon.com`) and Production (`https://sellingpartnerapi-eu.amazon.com`).

---

### B. Pending Requirements (Platform Configuration & Deployment)
- [ ] **Production Environment Variable Provisioning**: Configure production secrets on hosting provider (Render/AWS/Vercel) with HTTPS enforcement.
- [ ] **HTTPS OAuth Redirect URI Whitelist**: Add production domain redirect URIs (e.g., `https://api.yourdomain.com/api/channels/amazon/oauth/callback`) to the LWA Security Profile.
- [ ] **Data Retention & Purge Cron**: Automated scheduled cron job to enforce the 30-day PII deletion requirement per Amazon Data Protection Policy.
- [ ] **Security Incident Response Workflow**: Documented standard operating procedure (SOP) for notifying Amazon Security (`3p-security@amazon.com`) within 24 hours of any suspected breach.

---

### C. Blocked Requirements (Requires Legal Business Documentation)
- [ ] **Amazon Developer Account Verification**:
  - **Blocker**: Amazon requires an active Amazon Professional Selling Account in good standing or an approved Amazon Developer Account.
  - **Required Documents**: Government business registration certificate (GSTIN, Certificate of Incorporation), registered business address proof, matching business PAN, and authorized signatory identity.
  - **Resolution**: Account owner must complete the Amazon Solution Provider Portal identity verification flow.
- [ ] **Developer Registration & DPP Assessment**:
  - **Blocker**: Submission of the developer registration questionnaire explaining the application's business purpose, architectural diagrams, encryption standards, and access control models.
- [ ] **Direct-to-Consumer / Restricted PII Access Request**:
  - **Blocker**: If merchant-fulfilled (FBM) shipping label generation is ever required in future phases, Amazon requires specialized approval for the *Direct-to-Consumer Shipping* role. Our read-only integration deliberately does not request this role.

---

## 3. Production Readiness Checklist for Developers

| Step | Task | Owner | Dependency | Status |
| :---: | :--- | :--- | :--- | :---: |
| 1 | Complete Developer Central Profile with registered business domain email | Seller/Owner | Business Legal Entity | **BLOCKED** |
| 2 | Submit Seller Central Developer Profile with requested roles | Seller/Owner | Developer Central | **BLOCKED** |
| 3 | Create Production SP-API App in Developer Central | Seller/Owner | Developer Profile Approval | **PENDING** |
| 4 | Configure LWA Production Client Credentials | Tech Lead | App Creation | **PENDING** |
| 5 | Configure Production Webhook/OAuth Redirect URLs | DevOps | SSL Domain Provisioning | **PENDING** |
| 6 | Execute Production Pilot with 1 Connected Seller | QA / Tech Lead | LWA Credentials | **PENDING** |
| 7 | Full Regression Audit on Production Endpoint | QA Team | Pilot Approval | **PENDING** |

---

## 4. Sandbox vs. Production Behavior Differences

| Dimension | Sandbox Environment | Production Environment |
| :--- | :--- | :--- |
| **Base Endpoint** | `https://sandbox.sellingpartnerapi-eu.amazon.com` | `https://sellingpartnerapi-eu.amazon.com` |
| **OAuth Consent URL** | `https://sellercentral.amazon.in/apps/authorize/consent?version=beta` | `https://sellercentral.amazon.in/apps/authorize/consent` (no `version=beta`) |
| **LWA Authorization** | Accepts static Developer Self-Authorization tokens | Requires real Amazon seller OAuth 2.0 authorization code exchange |
| **API Response Data** | Static mock data or canned SP-API test objects | Live, real-time seller orders, inventory, pricing, and financial records |
| **Finances API** | Often returns empty `RefundEventList` | Returns actual buyer refund events, item charge adjustments, and transaction dates |
| **Rate Limits** | Relaxed or mock-level response headers | Strict per-operation rate limits with real HTTP 429 enforcement |
| **Data Protection Audit** | Not audited by Amazon InfoSec | Subject to periodic automated and manual Amazon compliance audits |

---

## 5. Decision & Next Steps
1. **Do not attempt to call production endpoints** with sandbox refresh tokens; LWA will reject the tokens with `invalid_grant` or HTTP 401.
2. Complete Developer Central business registration using genuine commercial documents.
3. Keep the platform in `AMAZON_SP_API_ENV=sandbox` until Amazon approves the production application profile.
