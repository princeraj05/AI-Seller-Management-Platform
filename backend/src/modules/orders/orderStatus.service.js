import { adjustStockService } from '../inventory/inventory.service.js';

const ALLOWED_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'PROCESSING', 'CANCELLED', 'FAILED'],
  CONFIRMED: ['PROCESSING', 'PACKED', 'CANCELLED'],
  PROCESSING: ['PACKED', 'SHIPPED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED', 'RETURN_REQUESTED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['COMPLETED', 'RETURN_REQUESTED'],
  COMPLETED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED', 'REFUNDED'],
  RETURNED: ['REFUNDED'],
  CANCELLED: [],
  FAILED: [],
  REFUNDED: [],
};

export const isValidStatusTransition = (currentStatus, newStatus) => {
  const curr = currentStatus ? currentStatus.toUpperCase() : 'PENDING';
  const target = newStatus ? newStatus.toUpperCase() : 'PENDING';

  if (curr === target) return true;

  const allowed = ALLOWED_TRANSITIONS[curr] || [];
  return allowed.includes(target);
};

export const handleOrderStatusChange = async (order, newStatus, userContext = {}) => {
  const previousStatus = order.status;
  const targetStatus = newStatus.toUpperCase();

  if (!isValidStatusTransition(previousStatus, targetStatus)) {
    throw new Error(`Invalid status transition from '${previousStatus}' to '${targetStatus}'`);
  }

  order.status = targetStatus;
  order.statusHistory.push({
    status: targetStatus,
    previousStatus,
    changedBy: userContext.name || 'System',
    note: userContext.note || `Order status updated to ${targetStatus}`,
    createdAt: new Date(),
  });

  // If order is CANCELLED and inventory was previously deducted, restore sellable stock
  if (targetStatus === 'CANCELLED' && order.inventoryDeducted) {
    for (const item of order.items) {
      try {
        await adjustStockService(
          { sellerId: order.sellerId, storeId: order.storeId },
          {
            sku: item.sku,
            productId: item.productId,
            delta: item.quantity, // Restore positive quantity
            reason: `Order #${order.orderNumber} cancellation stock restoration`,
            type: 'RETURN',
          }
        );
      } catch (err) {
        console.warn(`Stock restoration for SKU '${item.sku}' on order cancellation failed:`, err.message);
      }
    }
    order.inventoryDeducted = false;
  }

  await order.save();
  return order;
};
