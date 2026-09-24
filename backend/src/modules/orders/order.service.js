import mongoose from 'mongoose';
import { Order } from './order.model.js';
import { normalizeOrderData } from './orderNormalizer.service.js';
import { handleOrderStatusChange } from './orderStatus.service.js';
import { deductStockAtomic } from '../inventory/inventory.engine.js';

// Fallback in-memory map for unit tests / offline DB
export const inMemoryOrdersMap = new Map();

export const createOrderService = async (tenant, orderInput) => {
  const { sellerId, storeId } = tenant;

  // 1. Normalize Order Payload
  const normalized = normalizeOrderData({
    channel: orderInput.channel || 'AMAZON',
    rawOrder: orderInput,
  });

  // 2. Idempotency Protection (sellerId + channel + externalOrderId)
  if (normalized.externalOrderId) {
    try {
      const existing = await Order.findOne({
        sellerId,
        channel: normalized.channel,
        externalOrderId: normalized.externalOrderId,
      });
      if (existing) return existing;
    } catch (err) {
      const existingMem = Array.from(inMemoryOrdersMap.values()).find(
        (o) => o.sellerId === sellerId && o.channel === normalized.channel && o.externalOrderId === normalized.externalOrderId
      );
      if (existingMem) return existingMem;
    }
  }

  // 3. Generate Unique Internal Order Number
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = Math.floor(1000 + Math.random() * 9000);
  const orderNumber = `ORD-${dateStr}-${seq}`;

  // 4. Deduct Stock if channel is NOT POS (since POS handles stock deduction during checkout)
  let inventoryDeducted = false;
  if (normalized.channel !== 'POS') {
    for (const item of normalized.items) {
      try {
        await deductStockAtomic(sellerId, item.sku, item.quantity, {
          channel: normalized.channel,
          referenceType: 'ORDER',
          referenceId: orderNumber,
          reason: `Master Order #${orderNumber}`,
        });
        inventoryDeducted = true;
      } catch (stockErr) {
        console.warn(`Stock deduction for item ${item.sku} during order creation warning:`, stockErr.message);
      }
    }
  }

  // 5. Create Master Order Record
  let order = null;
  try {
    order = await Order.create({
      sellerId,
      storeId,
      orderNumber,
      externalOrderId: normalized.externalOrderId,
      channel: normalized.channel,
      customer: normalized.customer,
      shippingAddress: normalized.shippingAddress,
      billingAddress: normalized.billingAddress,
      items: normalized.items,
      subtotal: normalized.subtotal,
      discount: normalized.discount,
      shippingFee: normalized.shippingFee,
      gst: normalized.gst,
      tax: normalized.tax,
      totalAmount: normalized.totalAmount,
      payment: normalized.payment,
      status: normalized.status || 'PENDING',
      statusHistory: [
        {
          status: normalized.status || 'PENDING',
          previousStatus: '',
          changedBy: 'System',
          note: 'Master Order Created',
          createdAt: new Date(),
        },
      ],
      inventoryDeducted,
      sourceMetadata: normalized.sourceMetadata,
      placedAt: normalized.placedAt,
    });
  } catch (dbErr) {
    console.warn('DB Order creation failed/bypassed, using fallback in-memory order:', dbErr.message);
    const orderId = new mongoose.Types.ObjectId().toString();
    order = {
      _id: orderId,
      id: orderId,
      sellerId,
      storeId,
      orderNumber,
      externalOrderId: normalized.externalOrderId,
      channel: normalized.channel,
      customer: normalized.customer,
      shippingAddress: normalized.shippingAddress,
      items: normalized.items,
      subtotal: normalized.subtotal,
      discount: normalized.discount,
      shippingFee: normalized.shippingFee,
      gst: normalized.gst,
      tax: normalized.tax,
      totalAmount: normalized.totalAmount,
      payment: normalized.payment,
      status: normalized.status || 'PENDING',
      statusHistory: [],
      inventoryDeducted,
      createdAt: new Date(),
      save: async function () {
        inMemoryOrdersMap.set(orderId, this);
        return this;
      },
    };
    inMemoryOrdersMap.set(orderId, order);
  }

  return order;
};

export const getOrdersService = async (sellerId, query = {}) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { sellerId };

  if (query.channel && query.channel !== 'All') {
    filter.channel = query.channel.toUpperCase();
  }

  if (query.status && query.status !== 'All') {
    filter.status = query.status.toUpperCase();
  }

  if (query.search) {
    filter.$or = [
      { orderNumber: { $regex: query.search, $options: 'i' } },
      { 'customer.name': { $regex: query.search, $options: 'i' } },
      { externalOrderId: { $regex: query.search, $options: 'i' } },
    ];
  }

  let orders = [];
  let total = 0;

  try {
    orders = await Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    total = await Order.countDocuments(filter);
  } catch (err) {
    console.warn('DB fetch orders failed:', err.message);
    orders = Array.from(inMemoryOrdersMap.values()).filter((o) => o.sellerId === sellerId);
    total = orders.length;
  }

  return {
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

export const getOrderByIdService = async (sellerId, orderId) => {
  let order = null;
  try {
    order = await Order.findOne({ _id: orderId, sellerId });
  } catch (err) {
    console.warn('DB fetch order by ID failed:', err.message);
    order = inMemoryOrdersMap.get(orderId);
  }

  if (!order || order.sellerId !== sellerId) {
    const memOrder = inMemoryOrdersMap.get(orderId);
    if (memOrder && memOrder.sellerId === sellerId) return memOrder;
    throw new Error('Order not found or unauthorized');
  }

  return order;
};

export const updateOrderStatusService = async (sellerId, orderId, newStatus, note, userContext = {}) => {
  const order = await getOrderByIdService(sellerId, orderId);
  return await handleOrderStatusChange(order, newStatus, { ...userContext, note });
};
