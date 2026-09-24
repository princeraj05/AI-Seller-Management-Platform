import { Inventory } from './inventory.model.js';
import { InventoryTransaction } from './inventoryTransaction.model.js';
import { Product } from '../products/product.model.js';
import { deriveStockStatus, reserveStockAtomic, releaseReservationAtomic, inMemoryInventoryMap, inMemoryTransactionsList } from './inventory.engine.js';

export const getInventoryService = async (sellerId, query = {}) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { sellerId };

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }

  if (query.search) {
    filter.sku = { $regex: query.search, $options: 'i' };
  }

  let inventory = [];
  let total = 0;

  try {
    inventory = await Inventory.find(filter).populate('productId', 'title image categoryName').sort({ updatedAt: -1 }).skip(skip).limit(limit);
    total = await Inventory.countDocuments(filter);
  } catch (err) {
    console.warn('DB fetch inventory failed/bypassed:', err.message);
  }

  // If DB returned empty list, auto-populate from products if available
  if (inventory.length === 0) {
    try {
      const products = await Product.find({ sellerId });
      inventory = products.map((p) => ({
        _id: `inv-${p._id}`,
        sellerId: p.sellerId,
        productId: p,
        sku: p.sku,
        availableStock: p.stock || 0,
        reservedStock: 0,
        status: deriveStockStatus(p.stock || 0),
      }));
      total = inventory.length;
    } catch (pErr) {
      console.warn('Product fallback for inventory failed:', pErr.message);
    }
  }

  return {
    inventory,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

export const getInventoryLedgerService = async (sellerId, query = {}) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const skip = (page - 1) * limit;

  let transactions = [];
  let total = 0;

  try {
    transactions = await InventoryTransaction.find({ sellerId }).sort({ createdAt: -1 }).skip(skip).limit(limit);
    total = await InventoryTransaction.countDocuments({ sellerId });
  } catch (err) {
    console.warn('DB fetch ledger failed:', err.message);
    transactions = inMemoryTransactionsList.filter((t) => t.sellerId === sellerId);
    total = transactions.length;
  }

  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

export const adjustStockService = async (tenant, data) => {
  const { sellerId, storeId } = tenant;
  const { sku, productId, delta, reason, type = 'ADJUSTMENT' } = data;

  let normalizedSku = sku ? sku.toUpperCase().trim() : '';

  if (!normalizedSku && productId) {
    try {
      const product = await Product.findOne({ _id: productId, sellerId });
      if (product) normalizedSku = product.sku;
    } catch (pErr) {
      console.warn('Product lookup by ID failed:', pErr.message);
    }
  }

  if (!normalizedSku) {
    throw new Error('Could not resolve SKU for stock adjustment');
  }

  let inventory = null;

  try {
    inventory = await Inventory.findOne({ sellerId, sku: normalizedSku });

    if (!inventory) {
      const product = await Product.findOne({ sellerId, sku: normalizedSku });
      inventory = await Inventory.create({
        sellerId,
        storeId,
        productId: product ? product._id : null,
        sku: normalizedSku,
        availableStock: 0,
        status: 'OUT_OF_STOCK',
      });
    }

    const previousStock = inventory.availableStock;
    const newStock = previousStock + delta;

    if (newStock < 0) {
      throw new Error(`Stock cannot become negative. Current: ${previousStock}, Adjustment: ${delta}`);
    }

    inventory.availableStock = newStock;
    inventory.status = deriveStockStatus(newStock, inventory.lowStockThreshold);
    await inventory.save();

    await Product.updateOne({ sellerId, sku: normalizedSku }, { $set: { stock: newStock } });

    await InventoryTransaction.create({
      sellerId,
      storeId,
      productId: inventory.productId,
      sku: normalizedSku,
      type,
      channel: 'MANUAL',
      quantityChange: delta,
      previousStock,
      newStock,
      referenceType: 'MANUAL_ADJUSTMENT',
      reason: reason || 'Manual stock adjustment',
    });

    return inventory;
  } catch (err) {
    if (err.message.includes('Stock cannot become negative')) {
      throw err;
    }

    console.warn('DB adjust stock bypassed/failed, executing fallback memory engine:', err.message);

    const memKey = `${sellerId}_${normalizedSku}`;
    let memItem = inMemoryInventoryMap.get(memKey);

    if (!memItem) {
      memItem = {
        sellerId,
        sku: normalizedSku,
        availableStock: 0,
        reservedStock: 0,
        lowStockThreshold: 10,
        status: 'OUT_OF_STOCK',
      };
      inMemoryInventoryMap.set(memKey, memItem);
    }

    const previousStock = memItem.availableStock;
    const newStock = previousStock + delta;

    if (newStock < 0) {
      throw new Error(`Stock cannot become negative. Current: ${previousStock}, Adjustment: ${delta}`);
    }

    memItem.availableStock = newStock;
    memItem.status = deriveStockStatus(newStock, memItem.lowStockThreshold);

    inMemoryTransactionsList.push({
      sellerId,
      sku: normalizedSku,
      type,
      channel: 'MANUAL',
      quantityChange: delta,
      previousStock,
      newStock,
      referenceType: 'MANUAL_ADJUSTMENT',
      reason: reason || 'Manual stock adjustment',
      createdAt: new Date(),
    });

    return memItem;
  }
};

export const reserveStockService = async (tenant, data) => {
  return await reserveStockAtomic(tenant.sellerId, data.sku, data.quantity);
};

export const releaseReservationService = async (tenant, data) => {
  return await releaseReservationAtomic(tenant.sellerId, data.sku, data.quantity);
};
