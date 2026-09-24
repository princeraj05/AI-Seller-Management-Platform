import os
import sys
import glob
from PIL import Image as PILImage

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

# Output PDF path
OUTPUT_PDF_PATH = r"D:\SEMESTER 7\AI Seller Management Platform\Pdf\AI_Seller_Management_Platform_Master_Documentation.pdf"
IMAGE_DIR = r"D:\SEMESTER 7\AI Seller Management Platform\UI Degin"

# Palette definition
COLOR_NAVY = colors.HexColor('#0F172A')       # Dark Navy / Primary
COLOR_BLUE = colors.HexColor('#2563EB')       # Bright Blue / Accent
COLOR_TEAL = colors.HexColor('#0D9488')       # Teal Accent
COLOR_TEXT = colors.HexColor('#1E293B')       # Body text dark slate
COLOR_MUTED = colors.HexColor('#64748B')      # Muted text slate
COLOR_BG_LIGHT = colors.HexColor('#F8FAFC')   # Light background
COLOR_BORDER = colors.HexColor('#CBD5E1')     # Border color
COLOR_SUCCESS = colors.HexColor('#059669')    # Success green

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            super().showPage()
        super().save()

    def draw_page_number(self, page_count):
        if self._pageNumber == 1:
            return  # Skip cover page running header & footer

        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(COLOR_MUTED)

        # Header
        self.drawString(54, 808, "AI SELLER MANAGEMENT PLATFORM — PROJECT DOCUMENTATION & TECHNICAL BLUEPRINT")
        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.5)
        self.line(54, 800, 541, 800)

        # Footer
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(541, 32, page_str)
        self.drawString(54, 32, "CONFIDENTIAL & PROPRIETARY — SYSTEM SPECIFICATION GUIDE")
        self.line(54, 44, 541, 44)

        self.restoreState()

def build_pdf():
    pdf_dir = os.path.dirname(OUTPUT_PDF_PATH)
    os.makedirs(pdf_dir, exist_ok=True)

    doc = SimpleDocTemplate(
        OUTPUT_PDF_PATH,
        pagesize=A4,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Custom styles
    style_cover_badge = ParagraphStyle(
        'CoverBadge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=12,
        textColor=COLOR_BLUE,
        alignment=0,
        spaceAfter=15
    )

    style_cover_title = ParagraphStyle(
        'CoverTitle',
        parent=styles['Title'],
        fontName='Helvetica-Bold',
        fontSize=28,
        leading=34,
        textColor=COLOR_NAVY,
        alignment=0,
        spaceAfter=15
    )

    style_cover_subtitle = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=13,
        leading=18,
        textColor=COLOR_MUTED,
        alignment=0,
        spaceAfter=25
    )

    style_h1 = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=COLOR_NAVY,
        spaceBefore=18,
        spaceAfter=10,
        keepWithNext=True
    )

    style_h2 = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=COLOR_BLUE,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    style_h3 = ParagraphStyle(
        'Heading3_Custom',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=COLOR_NAVY,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    style_body = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=COLOR_TEXT,
        spaceAfter=8
    )

    style_bullet = ParagraphStyle(
        'Bullet_Custom',
        parent=style_body,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4
    )

    style_code = ParagraphStyle(
        'Code_Custom',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8.5,
        leading=11,
        textColor=COLOR_NAVY,
        backColor=COLOR_BG_LIGHT,
        borderColor=COLOR_BORDER,
        borderWidth=0.5,
        borderPadding=6,
        spaceAfter=8
    )

    story = []

    # ==========================================
    # COVER PAGE
    # ==========================================
    story.append(Spacer(1, 40))
    story.append(Paragraph("TECHNICAL BLUEPRINT & SYSTEM DOCUMENTATION", style_cover_badge))
    story.append(Paragraph("AI SELLER MANAGEMENT PLATFORM", style_cover_title))
    story.append(HRFlowable(width="100%", thickness=3, color=COLOR_BLUE, spaceBefore=0, spaceAfter=15))
    story.append(Paragraph("Complete Technical Blueprint: AI Product Studio, Multi-Marketplace (Amazon, Flipkart, Myntra), Own Website (Shopify, WooCommerce, Wix, Custom API), 1-Click Multi-Channel Deployment, Unified Inventory Ledger & Offline POS System", style_cover_subtitle))
    
    story.append(Spacer(1, 30))

    meta_data = [
        [Paragraph("<b>Project Name:</b>", style_body), Paragraph("AI Seller Management Platform", style_body)],
        [Paragraph("<b>Primary Industry:</b>", style_body), Paragraph("Fashion, Apparel, Handicrafts & Omnichannel Retail", style_body)],
        [Paragraph("<b>Target Channels:</b>", style_body), Paragraph("Amazon, Flipkart, Myntra, Own Website (Shopify/WooCommerce/Wix/Custom), Offline POS / Hand-Cart Store", style_body)],
        [Paragraph("<b>Core Feature:</b>", style_body), Paragraph("1-Click AI Automated Multi-Channel Product Deployment", style_body)],
        [Paragraph("<b>Technology Stack:</b>", style_body), Paragraph("React + Vite, Node.js, Express.js, MongoDB Atlas, Firebase Auth, AI Vision & NLP Services", style_body)],
        [Paragraph("<b>Document Version:</b>", style_body), Paragraph("Version 2.0 (Comprehensive Client Edition - September 2026)", style_body)],
    ]
    t_meta = Table(meta_data, colWidths=[130, 350])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), COLOR_BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t_meta)

    story.append(Spacer(1, 60))
    story.append(Paragraph("<b>Confidentiality Notice:</b> This document contains proprietary system design, API contracts, workflow diagrams, and technical specifications for the AI Seller Management Platform. All content is intended strictly for client review and software engineering implementation.", ParagraphStyle('Notice', parent=style_body, fontSize=8, textColor=COLOR_MUTED)))

    story.append(PageBreak())

    # ==========================================
    # EXECUTIVE OVERVIEW & ARCHITECTURE
    # ==========================================
    story.append(Paragraph("1. Executive Summary & Core Platform Concept", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BLUE, spaceBefore=0, spaceAfter=12))
    
    story.append(Paragraph("The <b>AI Seller Management Platform</b> is an end-to-end multi-channel e-commerce automation system designed for modern sellers operating across online marketplaces (Amazon, Flipkart, Myntra), their own custom/branded online storefronts (Shopify, WooCommerce, Wix, or Custom API), and physical retail outlets (offline clothing stores, hand-carts, popup shops).", style_body))
    story.append(Paragraph("Traditional e-commerce management requires sellers to manually login to each platform, resize images, write marketplace-specific product descriptions, select complex category nodes, map specific attributes (e.g. neck type, sleeve style, fabric care), and adjust inventory levels across 4+ different seller dashboards. This manual workflow is highly repetitive, prone to errors, and severely limits business scaling.", style_body))
    story.append(Paragraph("<b>The Core Solution — Master Catalog & AI Automation:</b> Our platform introduces the <i>Single Master Catalog Paradigm</i>. The seller uploads product photos and basic price/SKU details ONCE into the platform. AI automatically analyzes images, generates SEO-rich titles and descriptions, extracts category and style attributes, and creates channel-compliant payloads. With <b>1-Click Multi-Channel Deployment</b>, the system automatically pushes the product simultaneously to Amazon, Flipkart, Myntra, and the seller's own website without any manual repetition.", style_body))

    story.append(Spacer(1, 10))
    story.append(Paragraph("2. System Architecture & Technical Flow", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BLUE, spaceBefore=0, spaceAfter=12))

    arch_text = """
    <b>Centralized Hub Architecture:</b><br/>
    • <b>Master Product Single Source of Truth:</b> All product data originates in MongoDB as a Master Product entity. Marketplace listings are channel projections of this master catalog.<br/>
    • <b>AI Processing Engine:</b> Computer Vision extracts visual traits (color, pattern, fit, apparel type), while NLP models craft high-converting titles, descriptions, and channel tags.<br/>
    • <b>Marketplace Adapter Layer:</b> Decoupled connectors for Amazon (SP-API), Flipkart (Seller API), Myntra (Partner API), and Website Adapters (Shopify GraphQL, WooCommerce REST, Custom Webhooks).<br/>
    • <b>Unified Inventory Engine:</b> Ledger-based inventory transaction system. Stock changes anywhere (online order on Amazon, website purchase, or offline POS sale) immediately adjust master stock and sync out to all connected channels.<br/>
    • <b>No Password Storage Policy:</b> Complete compliance with security standards. Marketplace access is strictly handled via official OAuth 2.0 flows, token exchanges, and encrypted credential vaults.
    """
    story.append(Paragraph(arch_text, style_body))

    story.append(Spacer(1, 10))
    story.append(Paragraph("3. Deep-Dive Integration Mechanics", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BLUE, spaceBefore=0, spaceAfter=12))

    story.append(Paragraph("3.1 How Seller Connects with Amazon (SP-API)", style_h2))
    story.append(Paragraph("Amazon connectivity is powered by the official <b>Amazon Selling Partner API (SP-API)</b>. The connection flow follows Amazon's OAuth 2.0 authorization sequence:<br/>"
                           "1. <b>Initiation:</b> The seller clicks 'Connect Amazon' in our dashboard, redirecting them to Amazon's official Seller Central sign-in page.<br/>"
                           "2. <b>Consent & Auth Code:</b> The seller logs into Amazon, approves our application's requested permissions (Listings, Orders, Inventory), and Amazon redirects back with an authorization code.<br/>"
                           "3. <b>Token Exchange:</b> Our backend securely exchanges the code for an LWA (Login with Amazon) Refresh Token and Access Token.<br/>"
                           "4. <b>Encrypted Vault:</b> Tokens are encrypted using AES-256 before storage in MongoDB.<br/>"
                           "5. <b>Listing Push & Feed Submission:</b> Product listings are submitted via Amazon JSON Schema Listings APIs or XML Feed Submissions, tracking feed status asynchronously until published.", style_body))

    story.append(Paragraph("3.2 How Seller Connects with Flipkart", style_h2))
    story.append(Paragraph("Flipkart integration utilizes the <b>Flipkart Marketplace Seller API</b>:<br/>"
                           "1. <b>Seller Authorization:</b> The seller authorizes our registered Flipkart Developer Application.<br/>"
                           "2. <b>App Credentials:</b> The system obtains the seller's Application ID and Secret, requesting temporary Bearer tokens for API sessions.<br/>"
                           "3. <b>Category & Attribute Mapping:</b> Flipkart requires specific mandatory attributes (e.g. FSN, Brand, Ideal For, Fabric, Style Code). Our Flipkart Adapter transforms master catalog attributes into Flipkart's taxonomy schema.<br/>"
                           "4. <b>Product Listing & Status Polling:</b> Product payloads are posted to Flipkart catalog creation endpoints. The backend polls listing status until approved.", style_body))

    story.append(Paragraph("3.3 How Seller Connects with Myntra", style_h2))
    story.append(Paragraph("Myntra integration uses the <b>Myntra Partner Integration API</b>:<br/>"
                           "1. <b>Partner Authorization:</b> Account authentication uses partner keys and API tokens provided during seller onboarding.<br/>"
                           "2. <b>Fashion Taxonomy Mapping:</b> As Myntra is fashion-centric, our AI engine specifically maps style attributes (Fit, Sleeve Type, Collar, Fabric Care, Occasion, Wash Care).<br/>"
                           "3. <b>Webhooks & Orders:</b> Live order webhooks notify our backend immediately when a Myntra customer purchases an item, triggering instant stock reservation.", style_body))

    story.append(Paragraph("3.4 How Seller Connects with Own Website (Shopify / WooCommerce / Wix / Custom)", style_h2))
    story.append(Paragraph("The platform supports four primary website connection types:<br/>"
                           "• <b>Shopify:</b> Connected via Shopify OAuth / GraphQL Admin API. Products are created via `productCreate` mutation, uploading media, variants, prices, and inventory levels (`inventorySetQuantities`). Webhooks handle real-time order deduction.<br/>"
                           "• <b>WooCommerce:</b> Connected via WooCommerce REST API v3 using Consumer Key and Consumer Secret. Products are posted directly to `/wp-json/wc/v3/products`.<br/>"
                           "• <b>Wix:</b> Connected using Wix REST API and eCommerce App credentials.<br/>"
                           "• <b>Custom E-Commerce Website:</b> For custom-built websites, our platform provides a clean REST API integration contract: `POST /api/integration/products` and a Webhook payload specification. The seller's website developer simply implements our standardized API contract.", style_body))

    story.append(Paragraph("3.5 How Automated 1-Click Multi-Channel Deployment Works", style_h2))
    story.append(Paragraph("The 1-Click deployment mechanism completely removes manual effort:<br/>"
                           "1. <b>Master Product Approval:</b> Seller creates/reviews product in AI Product Studio.<br/>"
                           "2. <b>Channel Selection:</b> Seller checks boxes for Amazon, Flipkart, Myntra, and Own Website.<br/>"
                           "3. <b>Parallel Queue Dispatch:</b> The system dispatches asynchronous background jobs to BullMQ queue workers for each selected channel.<br/>"
                           "4. <b>Schema Validation & Adapter Transformation:</b> Each channel adapter validates data against platform rules (e.g. image aspect ratios, required brand names, character limits).<br/>"
                           "5. <b>API Execution & Status Tracking:</b> Adapters call target channel APIs simultaneously. Dashboard status updates in real-time from `QUEUED` → `PUBLISHING` → `PUBLISHED`. If an error occurs (e.g. missing mandatory Flipkart attribute), the system highlights the exact field for 1-click resolution.", style_body))

    story.append(PageBreak())

    # ==========================================
    # TECHNOLOGY STACK
    # ==========================================
    story.append(Paragraph("4. Technology Stack & Infrastructure Architecture", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BLUE, spaceBefore=0, spaceAfter=12))

    tech_data = [
        [Paragraph("<b>Layer</b>", style_h3), Paragraph("<b>Technology / Framework</b>", style_h3), Paragraph("<b>Role & Key Function</b>", style_h3)],
        [Paragraph("Frontend UI", style_body), Paragraph("React + Vite, Tailwind CSS", style_body), Paragraph("Fast, responsive client portal with real-time UI states and dashboard analytics.", style_body)],
        [Paragraph("State & Query", style_body), Paragraph("TanStack Query (React Query)", style_body), Paragraph("Server-state synchronization, caching, and optimistic UI updates for listings.", style_body)],
        [Paragraph("Backend Runtime", style_body), Paragraph("Node.js + Express.js", style_body), Paragraph("RESTful API gateway, channel adapter execution, auth middleware, and validation.", style_body)],
        [Paragraph("Background Queue", style_body), Paragraph("BullMQ + Redis", style_body), Paragraph("Asynchronous job processing for order sync, inventory updates, and marketplace feed posting.", style_body)],
        [Paragraph("Database", style_body), Paragraph("MongoDB Atlas (Mongoose)", style_body), Paragraph("Flexible document store for Master Product catalog, channel listings, and ledger transactions.", style_body)],
        [Paragraph("Authentication", style_body), Paragraph("Firebase Authentication", style_body), Paragraph("Secure user identity management, multi-factor auth, and ID token verification middleware.", style_body)],
        [Paragraph("AI Vision & Text", style_body), Paragraph("OpenAI GPT-4o / Vision API", style_body), Paragraph("Visual feature extraction, automated titling, description writing, and attribute tagging.", style_body)],
        [Paragraph("Image AI", style_body), Paragraph("Cloudinary / Rembg API", style_body), Paragraph("Automatic background removal, image cropping, and marketplace-compliant canvas padding.", style_body)],
        [Paragraph("Deployment", style_body), Paragraph("Vercel (Frontend), Render/AWS (API)", style_body), Paragraph("Production scalable cloud deployment with SSL, CDN acceleration, and high availability.", style_body)]
    ]

    t_tech = Table(tech_data, colWidths=[90, 150, 240])
    t_tech.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, COLOR_BG_LIGHT])
    ]))
    story.append(t_tech)

    story.append(Spacer(1, 15))
    story.append(PageBreak())

    # ==========================================
    # 23 UI SCREENS WALKTHROUGH
    # ==========================================
    story.append(Paragraph("5. UI Screen Walkthrough & Step-by-Step Function Explanations", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BLUE, spaceBefore=0, spaceAfter=15))
    story.append(Paragraph("This section presents all <b>23 UI Screens</b> of the AI Seller Management Platform. Each image is paired with a comprehensive breakdown explaining its specific function, user interactions, backend API calls, AI processing steps, and channel integration logic.", style_body))
    story.append(Spacer(1, 10))

    # Define metadata for all 23 UI images
    ui_screens_data = [
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 04_46_31 PM.png",
            "title": "Screen 1: User Login & Firebase Authentication",
            "badge": "AUTHENTICATION & IDENTITY",
            "purpose": "Secure authentication portal for sellers to access their multi-channel commerce dashboard.",
            "user_actions": "Seller enters registered email and password, or chooses 'Sign in with Google' or 'Phone OTP Login'.",
            "backend_tech": "Firebase Auth SDK validates credentials on client side and generates a Firebase ID Token. Express `authMiddleware` verifies token signature on every protected API route.",
            "integration_detail": "Isolates application authentication from marketplace API tokens. Marketplace access credentials are kept separate in an encrypted MongoDB vault."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 04_46_43 PM.png",
            "title": "Screen 2: Seller Store Onboarding & Business Profile",
            "badge": "STORE SETUP & PROFILE",
            "purpose": "Configures seller business details, store type (Online, Offline Store, Hand-Cart), and default location.",
            "user_actions": "Seller inputs Business Name, Brand Name, GSTIN, Store Address, Default Currency, and select Store Types.",
            "backend_tech": "Calls `POST /api/stores` to save store metadata in MongoDB `stores` collection. Assigns default inventory location ID.",
            "integration_detail": "Store parameters are attached to all downstream marketplace listings and offline invoice templates."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 04_48_42 PM.png",
            "title": "Screen 3: Executive Omnichannel Commerce Dashboard",
            "badge": "OVERVIEW & DASHBOARD",
            "purpose": "Central command center displaying real-time metrics across Amazon, Flipkart, Myntra, Own Website, and Offline POS.",
            "user_actions": "Seller monitors total sales revenue, total orders count, channel performance breakdown, stock alerts, and quick action buttons.",
            "backend_tech": "Invokes `GET /api/analytics/dashboard` aggregating MongoDB pipeline queries across `orders`, `inventory`, and `connectedChannels` collections.",
            "integration_detail": "Provides live web-socket notifications for critical events such as low stock, failed listing syncs, or token expiry alerts."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 04_51_37 PM.png",
            "title": "Screen 4: Marketplace & Sales Channels Connections Hub",
            "badge": "CHANNEL INTEGRATION",
            "purpose": "Management hub showing active connection statuses for Amazon, Flipkart, Myntra, Own Website, and Offline POS.",
            "user_actions": "Seller views status badges ('Connected', 'Action Required', 'Not Connected') and clicks 'Connect' or 'Configure'.",
            "backend_tech": "Queries `GET /api/channels` to check encrypted token validity and API ping status for each connected marketplace.",
            "integration_detail": "Enables modular toggle of channels. Sellers can connect or disconnect any marketplace at any time without impacting master catalog data."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 04_54_31 PM.png",
            "title": "Screen 5: Amazon SP-API Authorization Modal",
            "badge": "AMAZON INTEGRATION",
            "purpose": "Official OAuth 2.0 authorization popup for linking seller's Amazon Seller Central account.",
            "user_actions": "Seller selects Amazon region (India - IN) and clicks 'Authorize on Amazon', opening official Amazon Seller Central login.",
            "backend_tech": "Handles callback `GET /api/channels/amazon/callback`, exchanges auth code for LWA Refresh Token, encrypts token using AES-256, and updates `marketplaceAccounts` model.",
            "integration_detail": "Strictly compliant with Amazon SP-API security policy. Password and OTP are never asked or saved by our application."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 04_57_09 PM (1).png",
            "title": "Screen 6: Flipkart Seller API Authorization Modal",
            "badge": "FLIPKART INTEGRATION",
            "purpose": "Configuration screen for establishing API connection with Flipkart Marketplace Seller Portal.",
            "user_actions": "Seller enters Flipkart Application ID, Application Secret, and Seller ID, then clicks 'Validate & Connect'.",
            "backend_tech": "Sends request to `POST /api/channels/flipkart/connect`. Backend executes API handshake with Flipkart Auth server to receive Access Token.",
            "integration_detail": "Saves token expiration timestamp. Background cron job `tokenRefresh.job.js` automatically renews Flipkart access tokens prior to expiry."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 04_57_12 PM (2).png",
            "title": "Screen 7: Myntra Partner Integration Setup",
            "badge": "MYNTRA INTEGRATION",
            "purpose": "Partner API configuration interface for fashion products catalog sync with Myntra.",
            "user_actions": "Seller enters Myntra Partner Secret and Integration Key, selecting target apparel categories.",
            "backend_tech": "Calls `POST /api/channels/myntra/connect`. Verifies connection against Myntra Partner Sandbox/Production endpoints.",
            "integration_detail": "Initializes Myntra fashion category mapping definitions for automated attribute conversion."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 04_59_41 PM.png",
            "title": "Screen 8: Own Website Connection Platform Selector",
            "badge": "WEBSITE INTEGRATION",
            "purpose": "Selection wizard enabling sellers to connect their existing branded e-commerce website.",
            "user_actions": "Seller selects platform option: Shopify, WooCommerce, Wix, or Custom Website API.",
            "backend_tech": "Routes user to platform-specific API authentication wizard based on selection.",
            "integration_detail": "Treats the seller's own website as a dedicated sales channel alongside Amazon and Flipkart, keeping inventory synchronized across all outlets."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_02_31 PM.png",
            "title": "Screen 9: Shopify OAuth & GraphQL Credentials Setup",
            "badge": "SHOPIFY INTEGRATION",
            "purpose": "API setup modal for connecting Shopify store via GraphQL Admin API.",
            "user_actions": "Seller enters store myshopify URL (e.g. `store.myshopify.com`) and authorizes Admin API scopes (`write_products`, `write_inventory`).",
            "backend_tech": "Executes Shopify OAuth flow. Stores Admin API Access Token and registers webhook listeners for `orders/create` and `inventory_levels/update`.",
            "integration_detail": "Enables 1-click product creation directly into Shopify catalog using GraphQL `productCreate` mutation."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_05_07 PM.png",
            "title": "Screen 10: WooCommerce REST API Connection Setup",
            "badge": "WOOCOMMERCE INTEGRATION",
            "purpose": "Integration setup modal for connecting WordPress WooCommerce store.",
            "user_actions": "Seller inputs WooCommerce Store URL, Consumer Key (`ck_...`), and Consumer Secret (`cs_...`).",
            "backend_tech": "Verifies credentials via `GET /wp-json/wc/v3/system_status`. Stores encrypted credentials in MongoDB `connectedChannels` collection.",
            "integration_detail": "Allows automated catalog push to WooCommerce REST API endpoint `/wp-json/wc/v3/products`."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_06_22 PM.png",
            "title": "Screen 11: Custom Website API & Webhook Configuration",
            "badge": "CUSTOM STORE API",
            "purpose": "API contract configuration interface for custom-built e-commerce websites.",
            "user_actions": "Seller inputs Custom API Endpoint URL, Authorization Header Secret, and Webhook URL.",
            "backend_tech": "Tests ping request `POST /api/integration/products` against custom endpoint. Validates JSON payload response contract.",
            "integration_detail": "Provides complete flexibility for sellers running custom Next.js/Laravel/Python storefronts."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_13_50 PM.png",
            "title": "Screen 12: Master Product Catalog Table",
            "badge": "CATALOG MANAGEMENT",
            "purpose": "Central product directory listing all products, SKU variants, prices, stock levels, and active channel badges.",
            "user_actions": "Seller searches, filters by category, views channel status icons (Amazon, Flipkart, Myntra, Website), and clicks 'Add New Product'.",
            "backend_tech": "Fetches data from `GET /api/products` with pagination, text search index on title/SKU, and populates variant stock.",
            "integration_detail": "Serves as the Single Source of Truth. Editing master product details updates connected channel listings automatically."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_16_16 PM.png",
            "title": "Screen 13: AI Product Studio — Image Upload & Vision Analysis",
            "badge": "AI PRODUCT STUDIO",
            "purpose": "Drag-and-drop studio for uploading raw product images for AI vision analysis.",
            "user_actions": "Seller uploads 1-5 product photos, inputs basic cost price and base SKU, and clicks 'Analyze with AI'.",
            "backend_tech": "Uploads images to Cloudinary/S3, executes Rembg background removal API, and passes image URLs to OpenAI GPT-4o Vision API.",
            "integration_detail": "Extracts visual characteristics: apparel type, primary color, pattern (striped, floral, solid), neck style, and fabric texture."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_17_04 PM.png",
            "title": "Screen 14: AI Content Studio — Title & Description Generation",
            "badge": "AI GENERATION",
            "purpose": "AI workspace generating high-converting product titles, bullet points, detailed descriptions, and SEO tags.",
            "user_actions": "Seller reviews AI-generated content, clicks 'Regenerate', edits text inline, and approves listing content.",
            "backend_tech": "Calls `POST /api/ai/product/generate`. NLP prompt formats text according to e-commerce marketplace SEO guidelines.",
            "integration_detail": "Ensures titles comply with character limit rules (Amazon: 200 chars, Flipkart: 150 chars, Shopify: 255 chars)."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_18_38 PM.png",
            "title": "Screen 15: AI Attribute Extraction & Category Mapping",
            "badge": "ATTRIBUTE EXTRACTION",
            "purpose": "Automatic attribute extraction screen identifying category node and required marketplace fields.",
            "user_actions": "Seller inspects auto-filled fields (Gender, Fit, Sleeve, Wash Care, Fabric) and fills any flagged missing attributes.",
            "backend_tech": "Calls `POST /api/ai/product/attributes`. Validates attributes against Amazon/Flipkart mandatory field schemas.",
            "integration_detail": "Prevents listing rejection by ensuring 100% attribute completeness prior to publishing."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_20_52 PM.png",
            "title": "Screen 16: 1-Click Multi-Channel Listing & Deploy Screen",
            "badge": "1-CLICK DEPLOYMENT",
            "purpose": "Unified deployment screen to publish master product across Amazon, Flipkart, Myntra, and Website simultaneously.",
            "user_actions": "Seller selects target channels via checkboxes, adjusts channel-specific markup pricing, and clicks 'Deploy Product to All Channels'.",
            "backend_tech": "Calls `POST /api/marketplaces/publish`. Dispatches parallel asynchronous jobs to BullMQ background workers.",
            "integration_detail": "Eliminates manual listing. Pushes formatted payload to Amazon SP-API, Flipkart API, Myntra API, and Shopify/Custom Website APIs in a single click."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_23_02 PM.png",
            "title": "Screen 17: Publishing Queue & Real-Time Status Monitor",
            "badge": "PUBLISHING MONITOR",
            "purpose": "Real-time tracker displaying listing publishing progress, success logs, and channel status badges.",
            "user_actions": "Seller monitors live progress bars (`QUEUED` → `PUBLISHED`), views external Listing IDs, or clicks 'Retry' on failed feeds.",
            "backend_tech": "WebSockets emit progress events from BullMQ queue workers. Updates `marketplaceListings` status in MongoDB.",
            "integration_detail": "Stores external channel product IDs (ASIN for Amazon, FSN for Flipkart, Product ID for Shopify) for future updates."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_23_54 PM.png",
            "title": "Screen 18: Unified Omnichannel Orders Dashboard",
            "badge": "ORDERS MANAGEMENT",
            "purpose": "Single order fulfillment table combining online orders (Amazon, Flipkart, Myntra, Website) and offline store bills.",
            "user_actions": "Seller filters orders by status (Pending, Packing, Shipped, Delivered), views order details, and prints shipping labels.",
            "backend_tech": "Aggregates orders from `GET /api/orders`. Scheduled background sync `orderSync.job.js` fetches new orders from channel APIs every 5 minutes.",
            "integration_detail": "Deducts master inventory stock automatically upon order creation across all sales channels."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_26_07 PM.png",
            "title": "Screen 19: Unified Master Inventory & Stock Ledger",
            "badge": "INVENTORY LEDGER",
            "purpose": "Central stock management matrix displaying real-time master inventory, channel allocation, and stock adjustment logs.",
            "user_actions": "Seller views total stock, sets low-stock threshold alerts, and adjusts stock quantities manually.",
            "backend_tech": "Calls `GET /api/inventory` and `POST /api/inventory/adjust`. Records every change in `inventoryTransactions` collection.",
            "integration_detail": "Audit-proof stock ledger. Stock reduction on one channel immediately triggers API updates to adjust stock on all other connected channels."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_27_18 PM.png",
            "title": "Screen 20: Offline POS / MyBill Store Cash Register",
            "badge": "OFFLINE POS & BILLING",
            "purpose": "Point of Sale interface for physical clothing store, hand-cart, or popup shop billing.",
            "user_actions": "Seller scans product barcode or searches SKU, selects variant size, accepts payment (Cash, UPI, Card), and prints invoice.",
            "backend_tech": "Calls `POST /api/pos/bills`. Deducts master inventory stock instantly and logs transaction as `OFFLINE_SALE`.",
            "integration_detail": "Ensures offline physical sales immediately reduce stock available for online sales on Amazon, Flipkart, Myntra, and Website."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_28_36 PM.png",
            "title": "Screen 21: Fashion Trend Intelligence & Style Signals",
            "badge": "TREND INTELLIGENCE",
            "purpose": "AI trend analytics dashboard highlighting rising fashion styles, popular colors, and category demand signals.",
            "user_actions": "Seller analyzes trending categories (e.g. Oversized T-Shirts, Cargo Pants), popular colors, and AI product opportunity alerts.",
            "backend_tech": "Queries `GET /api/trends` aggregating market signals, search trends, and seller sales history.",
            "integration_detail": "Provides data-driven recommendations helping sellers decide which products to manufacture or list next."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_30_35 PM.png",
            "title": "Screen 22: Business Sales & Revenue Analytics",
            "badge": "ANALYTICS & REPORTS",
            "purpose": "Financial reporting dashboard showing revenue, estimated profit margins, channel sales split, and top-selling SKUs.",
            "user_actions": "Seller selects date ranges (7 Days, 30 Days, Year-to-Date), exports CSV/PDF sales reports, and reviews profit margins.",
            "backend_tech": "Calls `GET /api/analytics/sales` and `GET /api/analytics/profit` utilizing MongoDB aggregation frameworks.",
            "integration_detail": "Provides full visibility into gross margins, channel commission costs, and net profitability."
        },
        {
            "img_file": "ChatGPT Image Sep 22, 2026, 05_32_24 PM.png",
            "title": "Screen 23: System Settings, User Roles & Audit Logs",
            "badge": "SETTINGS & AUDIT LOGS",
            "purpose": "Administrative configuration portal for managing staff access roles, API security keys, and security audit logs.",
            "user_actions": "Admin configures store preferences, invites staff users, inspects system audit logs, and manages integration keys.",
            "backend_tech": "Controls settings via `PATCH /api/stores/:id` and views security logs from `auditLogs` collection.",
            "integration_detail": "Maintains complete audit trail of channel connection changes, product publications, price modifications, and stock adjustments."
        }
    ]

    for item in ui_screens_data:
        card_elements = []

        # Header Title Box
        card_elements.append(Paragraph(item["title"].upper(), style_h2))
        card_elements.append(Paragraph(f"<b>MODULE BADGE:</b> <font color='{COLOR_BLUE.hexval()}'>{item['badge']}</font>", style_body))
        card_elements.append(HRFlowable(width="100%", thickness=1, color=COLOR_BORDER, spaceBefore=4, spaceAfter=8))

        # Image Flowable
        img_path = os.path.join(IMAGE_DIR, item["img_file"])
        if os.path.exists(img_path):
            try:
                # Open image to inspect aspect ratio
                im = PILImage.open(img_path)
                w, h = im.size
                target_w = 480
                target_h = int((h / w) * target_w)
                # Cap height if image is very tall
                if target_h > 310:
                    target_h = 310
                    target_w = int((w / h) * target_h)

                img_obj = Image(img_path, width=target_w, height=target_h)
                img_obj.hAlign = 'CENTER'

                # Put image in a nice centered table box with light gray background
                img_table = Table([[img_obj]], colWidths=[487])
                img_table.setStyle(TableStyle([
                    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                    ('BACKGROUND', (0,0), (-1,-1), COLOR_BG_LIGHT),
                    ('BOX', (0,0), (-1,-1), 1, COLOR_BORDER),
                    ('TOPPADDING', (0,0), (-1,-1), 6),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                ]))
                card_elements.append(img_table)
                card_elements.append(Spacer(1, 8))
            except Exception as e:
                card_elements.append(Paragraph(f"<i>[Image loading note: {e}]</i>", style_body))
        else:
            card_elements.append(Paragraph(f"<i>[Image file not found: {item['img_file']}]</i>", style_body))

        # Detailed Function Working Explanation
        card_elements.append(Paragraph("<b>FUNCTION WORKING & SYSTEM EXPLANATION:</b>", style_h3))
        card_elements.append(Paragraph(f"• <b>Primary Purpose:</b> {item['purpose']}", style_bullet))
        card_elements.append(Paragraph(f"• <b>Seller Workflow Steps:</b> {item['user_actions']}", style_bullet))
        card_elements.append(Paragraph(f"• <b>Backend & AI Implementation:</b> {item['backend_tech']}", style_bullet))
        card_elements.append(Paragraph(f"• <b>Channel & Data Integration Logic:</b> {item['integration_detail']}", style_bullet))

        card_elements.append(Spacer(1, 14))

        # We wrap each screen block in KeepTogether or add PageBreak for clean page layout
        story.append(KeepTogether(card_elements))
        story.append(Spacer(1, 10))

    # Build PDF Document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Master PDF documentation successfully generated at:\n{OUTPUT_PDF_PATH}")

if __name__ == '__main__':
    build_pdf()
