import mongoose from 'mongoose';
import Return from './return.model.js';
import { Order } from '../orders/order.model.js';
import { adjustStockService } from '../inventory/inventory.service.js';
import { inMemoryOrdersMap } from '../orders/order.service.js';

export const inMemoryReturnsMap = new Map();

export const createReturnService = async (tenant, returnData) => {
  const { sellerId, storeId } = tenant;
  const { orderId, externalOrderId, items, reason, customerNote } = returnData;

  let order = null;
  let resolvedOrderId = orderId || null;
  let resolvedExternalOrderId = externalOrderId || null;
  let resolvedChannel = 'POS';

  if (orderId) {
    try {
      order = await Order.findOne({ sellerId, _id: orderId });
    } catch (err) {
      console.warn('Order lookup by ID failed, checking memory map:', err.message);
    }
  }

  if (!order && externalOrderId) {
    try {
      order = await Order.findOne({ sellerId, externalOrderId });
    } catch (err) {
      console.warn('Order lookup by externalOrderId failed, checking memory map:', err.message);
    }
  }

  // Fallback to memory map if DB is not connected
  if (!order) {
    for (const [, memOrd] of inMemoryOrdersMap.entries()) {
      if (
        memOrd.sellerId.toString() === sellerId.toString() &&
        ((orderId && memOrd._id === orderId) || (externalOrderId && memOrd.externalOrderId === externalOrderId))
      ) {
        order = memOrd;
        break;
      }
    }
  }

  if (order) {
    resolvedOrderId = order._id;
    resolvedExternalOrderId = order.externalOrderId;
    resolvedChannel = order.channel;
  }

  const rmaNumber = `RMA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

  const formattedItems = items.map((item) => ({
    _id: new mongoose.Types.ObjectId().toString(),
    sku: item.sku.toUpperCase().trim(),
    productId: item.productId || null,
    variantId: item.variantId || null,
    quantity: item.quantity,
    reason: item.reason || reason || 'Customer Return',
    condition: item.condition || 'NEW',
    inspectionStatus: 'PENDING',
    disposition: 'PENDING_INSPECTION',
    restockedQuantity: 0,
  }));

  const payload = {
    sellerId,
    storeId,
    rmaNumber,
    orderId: resolvedOrderId,
    externalOrderId: resolvedExternalOrderId,
    channel: resolvedChannel,
    items: formattedItems,
    status: 'REQUESTED',
    refundStatus: 'PENDING',
    refundAmount: returnData.refundAmount || 0,
    customerNote: customerNote || '',
  };

  try {
    const returnDoc = await Return.create(payload);
    return returnDoc;
  } catch (err) {
    console.warn('DB return creation failed/bypassed, storing in memory map:', err.message);
    const mockId = new mongoose.Types.ObjectId().toString();
    const mockReturn = {
      _id: mockId,
      id: mockId,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryReturnsMap.set(mockReturn._id, mockReturn);
    return mockReturn;
  }
};

export const getReturnsService = async (sellerId, query = {}) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { sellerId };

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }

  if (query.rmaNumber) {
    filter.rmaNumber = { $regex: query.rmaNumber, $options: 'i' };
  }

  let returns = [];
  let total = 0;

  try {
    returns = await Return.find(filter)
      .populate('orderId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    total = await Return.countDocuments(filter);
  } catch (err) {
    console.warn('DB getReturns failed/bypassed, reading memory map:', err.message);
    const all = Array.from(inMemoryReturnsMap.values()).filter(
      (r) => r.sellerId.toString() === sellerId.toString()
    );
    returns = all.slice(skip, skip + limit);
    total = all.length;
  }

  return {
    returns,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

export const getReturnByIdService = async (sellerId, returnId) => {
  try {
    const returnDoc = await Return.findOne({ sellerId, _id: returnId }).populate('orderId');
    if (returnDoc) return returnDoc;
  } catch (err) {
    console.warn('DB getReturnById failed/bypassed:', err.message);
  }

  const memReturn = inMemoryReturnsMap.get(returnId);
  if (memReturn && memReturn.sellerId.toString() === sellerId.toString()) {
    return memReturn;
  }

  throw new Error('Return record not found');
};

export const inspectReturnItemService = async (tenant, returnId, itemId, inspectionData) => {
  const { sellerId, storeId } = tenant;
  const { disposition, condition, adminNote } = inspectionData;

  let returnDoc = null;

  try {
    returnDoc = await Return.findOne({ sellerId, _id: returnId });
  } catch (err) {
    console.warn('DB find return failed/bypassed:', err.message);
  }

  if (!returnDoc) {
    returnDoc = inMemoryReturnsMap.get(returnId);
  }

  if (!returnDoc || returnDoc.sellerId.toString() === sellerId.toString() === false) {
    throw new Error('Return record not found');
  }

  const item = returnDoc.items.find(
    (i) => i._id && (i._id.toString() === itemId || i.sku === itemId)
  ) || returnDoc.items[0];

  if (!item) {
    throw new Error('Item not found in return request');
  }

  const prevDisposition = item.disposition;
  item.disposition = disposition;
  if (condition) item.condition = condition;
  item.inspectionStatus = 'INSPECTED';

  if (disposition === 'RESTOCK' && prevDisposition !== 'RESTOCK') {
    await adjustStockService(
      { sellerId, storeId },
      {
        sku: item.sku,
        productId: item.productId,
        delta: item.quantity,
        reason: `Restocked from Return RMA ${returnDoc.rmaNumber}`,
        type: 'RETURN_RESTOCK',
      }
    );
    item.restockedQuantity = item.quantity;
  }

  if (adminNote) {
    returnDoc.adminNote = adminNote;
  }

  const allInspected = returnDoc.items.every((i) => i.inspectionStatus === 'INSPECTED');
  if (allInspected) {
    returnDoc.status = 'INSPECTED';
  }

  try {
    if (typeof returnDoc.save === 'function') {
      await returnDoc.save();
    }
  } catch (saveErr) {
    console.warn('DB save return failed, updated in-memory:', saveErr.message);
    inMemoryReturnsMap.set(returnId, returnDoc);
  }

  return returnDoc;
};
