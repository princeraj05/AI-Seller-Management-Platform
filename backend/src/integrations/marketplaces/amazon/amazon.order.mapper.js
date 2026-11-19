/**
 * Amazon Orders API v2026-01-01 Data Mappers
 * Maps raw Amazon Orders API v2026-01-01 responses into the platform's Order schema
 * Strictly complies with Amazon Data Protection Policy: omits buyer PII, avoids fabricated address data.
 */

/**
 * Map Amazon Order Status (v2026-01-01) to internal platform status enum.
 * Supported official v2026-01-01 statuses:
 * - PENDING_AVAILABILITY -> PENDING
 * - PENDING -> PENDING
 * - UNSHIPPED -> CONFIRMED
 * - PARTIALLY_SHIPPED -> PROCESSING
 * - SHIPPED -> SHIPPED
 * - CANCELLED -> CANCELLED
 * - UNFULFILLABLE -> FAILED
 *
 * Any unknown status is mapped to 'UNKNOWN' and NOT silently converted to CONFIRMED.
 *
 * @param {string} amazonStatus
 * @returns {string} Normalized internal status
 */
export const mapAmazonOrderStatus = (amazonStatus = '') => {
  if (!amazonStatus || typeof amazonStatus !== 'string') {
    return 'UNKNOWN';
  }

  const norm = amazonStatus.trim().toUpperCase();

  switch (norm) {
    case 'PENDING_AVAILABILITY':
    case 'PENDING':
    case 'INVOICE_UNCONFIRMED':
    case 'INVOICEUNCONFIRMED':
      return 'PENDING';
    case 'UNSHIPPED':
      return 'CONFIRMED';
    case 'PARTIALLY_SHIPPED':
    case 'PARTIALLYSHIPPED':
      return 'PROCESSING';
    case 'SHIPPED':
      return 'SHIPPED';
    case 'DELIVERED':
    case 'COMPLETED':
      return 'DELIVERED';
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELLED';
    case 'UNFULFILLABLE':
      return 'FAILED';
    default:
      return 'UNKNOWN';
  }
};

/**
 * Map Amazon Fulfillment Channel code (AFN/MFN) to standard channel enum
 *
 * @param {string} channel
 * @returns {'FBA'|'FBM'|'UNKNOWN'}
 */
export const mapFulfillmentChannel = (channel = '') => {
  const norm = String(channel).toUpperCase();
  if (norm.includes('AFN') || norm.includes('FBA') || norm.includes('AMAZON')) {
    return 'FBA';
  }
  if (norm.includes('MFN') || norm.includes('FBM') || norm.includes('MERCHANT')) {
    return 'FBM';
  }
  return 'UNKNOWN';
};

/**
 * Map raw Order Items from v2026-01-01 response into platform order item schema.
 * In Orders API v2026-01-01, line items contain product details under `item.product`.
 * Links to existing Product ID if matching SKU exists; does NOT create new master products.
 *
 * @param {Array} rawItems
 * @param {Map<string, Object>} productSkuMap Map of SKU -> Product._id
 * @param {string} fulfillmentChannel
 * @returns {Array} Mapped order item documents
 */
export const mapAmazonOrderItems = (rawItems = [], productSkuMap = new Map(), fulfillmentChannel = 'UNKNOWN') => {
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item) => {
    // Official Orders API v2026-01-01 nests product info under item.product
    const productObj = item.product || {};
    const fulfillmentObj = item.fulfillment || {};

    const rawSku = productObj.sellerSku || item.sellerSku || item.SellerSKU || item.sku || '';
    const sku = rawSku.trim().toUpperCase() || 'AMZ-SKU';

    const asin = productObj.asin || item.asin || item.ASIN || '';
    const title = productObj.title || item.title || item.Title || item.itemName || `Amazon Item (${sku})`;
    const quantityOrdered = Number(item.quantityOrdered || item.QuantityOrdered || item.quantity || 1);

    const quantityShipped = Number(
      fulfillmentObj.quantityFulfilled ??
      item.quantityShipped ??
      item.QuantityShipped ??
      0
    );

    const quantityCancelled = Number(
      fulfillmentObj.quantityCancelled ??
      item.quantityCancelled ??
      item.QuantityCancelled ??
      0
    );

    const unitPriceObj = productObj.price?.unitPrice || item.itemPrice || item.ItemPrice || {};
    const hasExplicitUnitPrice = Boolean(productObj.price?.unitPrice || item.unitPrice);
    const rawPrice = Number(unitPriceObj.amount || unitPriceObj.Amount || item.unitPrice || 0);
    const unitPrice = hasExplicitUnitPrice
      ? rawPrice
      : (quantityOrdered > 1 && rawPrice > 0 ? Number((rawPrice / quantityOrdered).toFixed(2)) : rawPrice);
    const promotionDiscount = Number(item.promotionDiscount?.amount || item.PromotionDiscount?.Amount || 0);
    const itemTax = Number(item.itemTax?.amount || item.ItemTax?.Amount || 0);
    const shippingPrice = Number(fulfillmentObj.shippingPrice?.amount || item.shippingPrice?.amount || item.ShippingPrice?.Amount || 0);

    const total = Number(item.total || (hasExplicitUnitPrice ? unitPrice * quantityOrdered : rawPrice));

    const matchedProduct = productSkuMap.get(sku);
    const productId = matchedProduct ? (matchedProduct._id || matchedProduct.id) : null;

    // Shipment and tracking details
    const shipmentObj = Array.isArray(fulfillmentObj.shipments) && fulfillmentObj.shipments.length > 0
      ? fulfillmentObj.shipments[0]
      : (item.shipment || {});
    const carrier = String(shipmentObj.carrier || fulfillmentObj.carrier || item.carrier || '');
    const trackingNumber = String(shipmentObj.trackingNumber || fulfillmentObj.trackingNumber || item.trackingNumber || '');
    const shipDate = shipmentObj.shipDate
      ? new Date(shipmentObj.shipDate)
      : (fulfillmentObj.shipDate ? new Date(fulfillmentObj.shipDate) : (item.shipDate ? new Date(item.shipDate) : null));

    const derivedStatus =
      quantityCancelled >= quantityOrdered
        ? 'CANCELLED'
        : quantityShipped >= quantityOrdered
        ? 'SHIPPED'
        : quantityShipped > 0
        ? 'PARTIALLY_SHIPPED'
        : 'UNSHIPPED';
    const itemStatus = String(item.itemStatus || item.ItemStatus || derivedStatus);

    return {
      productId,
      orderItemId: item.orderItemId || item.OrderItemId || '',
      asin,
      sku,
      title,
      quantity: Math.max(quantityOrdered, 1),
      shippedQuantity: quantityShipped,
      cancelledQuantity: quantityCancelled,
      price: unitPrice,
      unitPrice,
      totalPrice: total,
      total,
      discount: promotionDiscount,
      promotionDiscount,
      tax: itemTax,
      shippingPrice,
      itemStatus,
      carrier,
      trackingNumber,
      shipDate,
      fulfillmentChannel,
    };
  });
};

/**
 * Map Amazon Finances API financial events into normalized refund information.
 * Strictly read-only extraction of verified RefundEventList records.
 *
 * @param {Object} financialEvents
 * @returns {{ refundAmount: number, refundStatus: string, refundDate: Date|null, refundEvents: Array }}
 */
export const mapAmazonFinancialEventsToRefunds = (financialEvents = {}) => {
  if (!financialEvents) {
    return {
      refundAmount: 0,
      totalRefunded: 0,
      refundStatus: 'NONE',
      refundDate: null,
      refundCount: 0,
      refundEvents: [],
      refunds: [],
      currency: 'INR',
    };
  }

  const rawRefundList =
    financialEvents.FinancialEvents?.RefundEventList ||
    financialEvents.financialEvents?.refundEventList ||
    financialEvents.RefundEventList ||
    financialEvents.refundEventList ||
    financialEvents.ShipmentEventList?.filter((e) => e.ShipmentItemAdjustmentList?.length > 0) ||
    [];

  if (!Array.isArray(rawRefundList) || rawRefundList.length === 0) {
    return {
      refundAmount: 0,
      totalRefunded: 0,
      refundStatus: 'NONE',
      refundDate: null,
      refundCount: 0,
      refundEvents: [],
      refunds: [],
      currency: 'INR',
    };
  }

  let totalRefund = 0;
  let latestDate = null;
  const mappedEvents = [];

  for (const event of rawRefundList) {
    const postedDate = event.PostedDate || event.postedDate ? new Date(event.PostedDate || event.postedDate) : null;
    if (postedDate && (!latestDate || postedDate > latestDate)) {
      latestDate = postedDate;
    }

    const adjustments = event.ShipmentItemAdjustmentList || event.shipmentItemAdjustmentList || [];
    let eventAmount = 0;

    for (const adj of adjustments) {
      const chargeList = adj.ItemChargeAdjustmentList || adj.itemChargeAdjustmentList || [];
      for (const charge of chargeList) {
        const amt = Math.abs(Number(charge.ChargeAmount?.CurrencyAmount || charge.chargeAmount?.currencyAmount || 0));
        eventAmount += amt;
      }
    }

    if (eventAmount === 0 && (event.TotalRefundAmount || event.totalRefundAmount)) {
      eventAmount = Math.abs(Number(event.TotalRefundAmount?.CurrencyAmount || event.totalRefundAmount?.currencyAmount || 0));
    }

    const mappedAdjustments = adjustments.map((adj) => ({
      sellerSku: adj.SellerSKU || adj.sellerSku || '',
      quantityShipped: adj.QuantityShipped || adj.quantityShipped || 0,
    }));

    totalRefund += eventAmount;
    mappedEvents.push({
      postedDate,
      amount: eventAmount,
      currency: 'INR',
      adjustmentsCount: adjustments.length,
      adjustedItems: mappedAdjustments,
    });
  }

  return {
    refundAmount: totalRefund,
    totalRefunded: totalRefund,
    refundStatus: totalRefund > 0 ? 'REFUNDED' : 'NONE',
    refundDate: latestDate,
    refundCount: mappedEvents.length,
    refundEvents: mappedEvents,
    refunds: mappedEvents,
    currency: 'INR',
  };
};

/**
 * Map an Amazon Orders API v2026-01-01 order into the platform's Order DB payload.
 *
 * Strict PII Rules:
 * - Omit shipping address fields when PII is not requested.
 * - Do NOT fabricate placeholder address values (e.g., 'Amazon Fulfillment Network', 'Protected', 'India').
 * - Keep customer display anonymized ('Amazon Customer').
 * - Preserve original Amazon status separately from normalized platform status.
 *
 * @param {Object} rawOrder Order object from v2026-01-01
 * @param {Object} context { sellerId, channelId, marketplaceId, productSkuMap, orderItems, financialEvents }
 * @returns {Object} Ready to upsert into Order collection
 */
export const mapAmazonOrderToDbPayload = (rawOrder, context = {}) => {
  const {
    sellerId,
    channelId,
    marketplaceId = 'A21TJRUUN4KGV',
    productSkuMap = new Map(),
    orderItems = [],
    financialEvents = null,
  } = context;

  const externalOrderId = (rawOrder.orderId || rawOrder.AmazonOrderId || `AMZ-${Date.now()}`).trim();
  const rawStatus = rawOrder.orderStatus || rawOrder.OrderStatus || 'UNSHIPPED';
  const platformStatus = mapAmazonOrderStatus(rawStatus);

  const rawChannel = rawOrder.fulfillmentChannel || rawOrder.FulfillmentChannel || 'AFN';
  const fulfillmentChannel = mapFulfillmentChannel(rawChannel);

  const purchaseDate = rawOrder.purchaseDate || rawOrder.PurchaseDate
    ? new Date(rawOrder.purchaseDate || rawOrder.PurchaseDate)
    : new Date();
  const lastUpdateDate = rawOrder.lastUpdateDate || rawOrder.LastUpdateDate
    ? new Date(rawOrder.lastUpdateDate || rawOrder.LastUpdateDate)
    : new Date();

  // Price & Currency Extraction
  const orderTotalObj = rawOrder.orderTotal || rawOrder.OrderTotal || {};
  const totalAmount = Number(orderTotalObj.amount || orderTotalObj.Amount || 0);
  const currency = orderTotalObj.currencyCode || orderTotalObj.CurrencyCode || 'INR';

  // Extract items directly from v2026-01-01 orderItems array or provided orderItems
  const itemsToMap = orderItems.length > 0
    ? orderItems
    : Array.isArray(rawOrder.orderItems || rawOrder.OrderItems)
    ? (rawOrder.orderItems || rawOrder.OrderItems)
    : [];

  const items = mapAmazonOrderItems(itemsToMap, productSkuMap, fulfillmentChannel);

  // Compute subtotal from items if totalAmount was omitted by Amazon (e.g. pending authorization)
  const itemsTotal = items.reduce((acc, curr) => acc + (curr.total || 0), 0);
  const finalTotal = totalAmount > 0 ? totalAmount : itemsTotal;

  // Extract packages & shipment details
  let rawShipments = rawOrder.fulfillment?.shipments || rawOrder.Shipments || rawOrder.packages || [];
  if ((!rawShipments || rawShipments.length === 0) && Array.isArray(itemsToMap)) {
    const itemShipments = itemsToMap
      .filter((it) => it.fulfillment?.carrier || it.fulfillment?.trackingNumber || it.carrier || it.trackingNumber)
      .map((it) => ({
        carrier: it.fulfillment?.carrier || it.carrier || '',
        trackingNumber: it.fulfillment?.trackingNumber || it.trackingNumber || '',
        shipDate: it.fulfillment?.shipDate || it.shipDate || null,
        shipmentStatus: it.fulfillment?.shipmentStatus || it.itemStatus || 'SHIPPED',
      }));
    if (itemShipments.length > 0) {
      rawShipments = itemShipments;
    }
  }
  const shipmentDetails = Array.isArray(rawShipments)
    ? rawShipments.map((s) => ({
        shipmentId: s.shipmentId || s.PackageId || '',
        carrier: s.carrier || s.CarrierName || '',
        trackingNumber: s.trackingNumber || s.TrackingNumber || '',
        shipDate: s.shipDate ? new Date(s.shipDate) : (s.ShipDate ? new Date(s.ShipDate) : null),
        deliveryDate: s.deliveryDate ? new Date(s.deliveryDate) : (s.EstimatedDeliveryDate ? new Date(s.EstimatedDeliveryDate) : null),
        shipmentStatus: s.shipmentStatus || s.ShipmentStatus || '',
      }))
    : [];

  // Financial refunds extraction
  const financialRefunds = mapAmazonFinancialEventsToRefunds(rawOrder.financialEvents || financialEvents);
  const refundAmount = Number(rawOrder.refundAmount || financialRefunds.refundAmount || 0);
  const refundStatus = rawOrder.refundStatus || (refundAmount > 0 ? (refundAmount >= finalTotal ? 'FULL' : 'PARTIAL') : (platformStatus === 'CANCELLED' ? 'REFUNDED' : 'NONE'));
  const refundDate = rawOrder.refundDate ? new Date(rawOrder.refundDate) : financialRefunds.refundDate;

  // Returns extraction
  const rawReturn = rawOrder.returnDetails || {};
  const returnDetails = {
    isReturned: Boolean(rawReturn.isReturned || platformStatus === 'RETURNED' || platformStatus === 'RETURN_REQUESTED'),
    returnStatus: rawReturn.returnStatus || (platformStatus === 'RETURN_REQUESTED' ? 'RETURN_REQUESTED' : platformStatus === 'RETURNED' ? 'RETURNED' : (platformStatus === 'CANCELLED' ? 'CANCELLED' : 'NONE')),
    returnReason: rawReturn.returnReason || rawOrder.cancelReason || rawOrder.CancelReason || (platformStatus === 'CANCELLED' ? 'Buyer Cancelled' : ''),
    returnDate: rawReturn.returnDate ? new Date(rawReturn.returnDate) : (platformStatus === 'RETURNED' || platformStatus === 'RETURN_REQUESTED' ? lastUpdateDate : null),
    returnQuantity: Number(rawReturn.returnQuantity || items.reduce((acc, it) => acc + (it.cancelledQuantity || 0), 0)),
    condition: rawReturn.condition || 'NEW',
    disposition: rawReturn.disposition || 'PENDING_INSPECTION',
  };

  return {
    sellerId,
    orderNumber: externalOrderId,
    externalOrderId,
    channel: 'AMAZON',
    channelId,
    provider: 'AMAZON',
    marketplaceId,
    fulfillmentChannel,
    currency,
    purchaseDate,
    lastUpdateDate,
    lastSyncedAt: new Date(),
    status: platformStatus,
    orderStatus: platformStatus,
    originalAmazonStatus: rawStatus,
    fulfillmentStatus: platformStatus === 'DELIVERED' || platformStatus === 'SHIPPED' ? 'FULFILLED' : 'UNFULFILLED',
    returnStatus: returnDetails.returnStatus,
    refundAmount,
    refundStatus,
    refundDate,
    shipmentDetails,
    returnDetails,
    // PII Protection: Strictly anonymized customer
    customer: {
      customerId: '',
      name: 'Amazon Customer',
      email: '',
      phone: '',
    },
    // Truly omit unrequested address data (do not fabricate placeholder address objects)
    shippingAddress: (rawOrder.shippingAddress && (rawOrder.shippingAddress.addressLine1?.trim() || rawOrder.shippingAddress.city?.trim()))
      ? {
          name: rawOrder.shippingAddress.name || '',
          phone: rawOrder.shippingAddress.phone || '',
          addressLine1: rawOrder.shippingAddress.addressLine1 || '',
          addressLine2: rawOrder.shippingAddress.addressLine2 || '',
          city: rawOrder.shippingAddress.city || '',
          state: rawOrder.shippingAddress.state || '',
          postalCode: rawOrder.shippingAddress.postalCode || '',
          country: rawOrder.shippingAddress.country || '',
        }
      : null,
    billingAddress: null,
    items,
    subtotal: finalTotal,
    discount: 0,
    shippingFee: 0,
    tax: 0,
    gst: 0,
    totalAmount: finalTotal,
    payment: {
      method: rawOrder.paymentMethod || 'AMAZON_PAY',
      status: platformStatus === 'CANCELLED' || refundStatus === 'REFUNDED' || refundStatus === 'FULL' ? 'REFUNDED' : 'PAID',
      transactionId: externalOrderId,
    },
    inventoryDeducted: false, // Read-only: never alters master product stock
    sourceMetadata: {
      apiVersion: '2026-01-01',
      originalAmazonStatus: rawStatus,
      amazonStatus: rawStatus,
      rawFulfillmentChannel: rawChannel,
      salesChannel: rawOrder.salesChannel || rawOrder.SalesChannel || 'Amazon.in',
      orderChannel: rawOrder.orderChannel || rawOrder.OrderChannel || '',
      shipServiceLevel: rawOrder.shipServiceLevel || rawOrder.ShipServiceLevel || '',
      numberOfItemsShipped: rawOrder.numberOfItemsShipped || 0,
      numberOfItemsUnshipped: rawOrder.numberOfItemsUnshipped || 0,
      orderType: rawOrder.orderType || rawOrder.OrderType || 'StandardOrder',
      financialRefunds,
    },
    placedAt: purchaseDate,
  };
};
