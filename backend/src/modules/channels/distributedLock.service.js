import crypto from 'crypto';
import DistributedSyncLock from './distributedSyncLock.model.js';
import { isProductionEnv } from '../../config/storage.js';

// In-memory fallback map strictly for offline dev / unit tests (NEVER used in production)
export const inMemoryLocksMap = new Map();

const withDbTimeout = (promise, ms = 2000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`DB operation timed out after ${ms}ms`)), ms)),
  ]);
};

/**
 * Acquire a durable atomic distributed lock scoped to sellerId and channelId
 *
 * @param {Object} params
 * @param {string} params.sellerId
 * @param {string} params.channelId
 * @param {string} [params.resource='AMAZON_ORDER_SYNC']
 * @param {number} [params.leaseMs=300000] 5 minutes default lease
 * @returns {Promise<{ lockKey: string, lockId: string, expiresAt: Date, sellerId: string, channelId: string }>}
 */
export const acquireDistributedLock = async ({
  sellerId,
  channelId,
  resource = 'AMAZON_ORDER_SYNC',
  leaseMs = 5 * 60 * 1000,
}) => {
  if (!sellerId) {
    throw new Error('sellerId is required to acquire distributed lock');
  }

  const cleanSellerId = String(sellerId);
  const cleanChannelId = channelId ? String(channelId) : 'DEFAULT';
  const lockKey = `${resource}:${cleanSellerId}:${cleanChannelId}`;
  const lockId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);

  let dbAvailable = true;

  try {
    // 1. Atomically reclaim an existing EXPIRED lock if one exists
    const reclaimed = await withDbTimeout(
      DistributedSyncLock.findOneAndUpdate(
        {
          lockKey,
          expiresAt: { $lte: now },
        },
        {
          $set: {
            sellerId: cleanSellerId,
            channelId: cleanChannelId,
            resource,
            lockId,
            acquiredAt: now,
            expiresAt,
          },
        },
        { new: true }
      ),
      1500
    );

    if (reclaimed) {
      // Synchronize in-memory map for parity
      inMemoryLocksMap.set(lockKey, { lockKey, lockId, expiresAt, sellerId: cleanSellerId, channelId: cleanChannelId });
      return { lockKey, lockId, expiresAt, sellerId: cleanSellerId, channelId: cleanChannelId };
    }

    // 2. Attempt to create a new lock record. The unique index on lockKey guarantees atomicity
    await withDbTimeout(
      DistributedSyncLock.create({
        lockKey,
        sellerId: cleanSellerId,
        channelId: cleanChannelId,
        resource,
        lockId,
        acquiredAt: now,
        expiresAt,
      }),
      1500
    );

    inMemoryLocksMap.set(lockKey, { lockKey, lockId, expiresAt, sellerId: cleanSellerId, channelId: cleanChannelId });
    return { lockKey, lockId, expiresAt, sellerId: cleanSellerId, channelId: cleanChannelId };
  } catch (err) {
    // Check if error is duplicate key (lock is currently held and unexpired)
    if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
      const conflictErr = new Error(`Order synchronization already running for seller ${sellerId}. Please wait for it to complete.`);
      conflictErr.code = 'SYNC_IN_PROGRESS';
      conflictErr.status = 409;
      throw conflictErr;
    }

    if (isProductionEnv()) {
      const lockErr = new Error('Distributed sync lock store is unavailable in production. Sync aborted safely.');
      lockErr.code = 'LOCK_SERVICE_UNAVAILABLE';
      lockErr.status = 503;
      throw lockErr;
    }

    dbAvailable = false;
  }

  // Database disconnected or offline fallback: emulate distributed lock in-memory with strict lease semantics
  if (!dbAvailable) {
    const existing = inMemoryLocksMap.get(lockKey);
    if (existing) {
      if (existing.expiresAt > now) {
        const conflictErr = new Error(`Order synchronization already running for seller ${sellerId}. Please wait for it to complete.`);
        conflictErr.code = 'SYNC_IN_PROGRESS';
        conflictErr.status = 409;
        throw conflictErr;
      }
      // Reclaim expired lock in-memory
      const lockObj = { lockKey, lockId, expiresAt, sellerId: cleanSellerId, channelId: cleanChannelId };
      inMemoryLocksMap.set(lockKey, lockObj);
      return lockObj;
    }

    const lockObj = { lockKey, lockId, expiresAt, sellerId: cleanSellerId, channelId: cleanChannelId };
    inMemoryLocksMap.set(lockKey, lockObj);
    return lockObj;
  }
};

/**
 * Safely renew an active distributed lock's lease (Heartbeat)
 * Extends expiresAt ONLY IF both lockKey AND lockId match.
 *
 * @param {Object} lockHandle
 * @param {string} lockHandle.lockKey
 * @param {string} lockHandle.lockId
 * @param {number} [leaseMs=300000]
 * @returns {Promise<boolean>} true if renewed, false if lock ownership was lost
 */
export const renewDistributedLock = async (lockHandle, leaseMs = 5 * 60 * 1000) => {
  if (!lockHandle || !lockHandle.lockKey || !lockHandle.lockId) {
    return false;
  }

  const { lockKey, lockId } = lockHandle;
  const now = new Date();
  const newExpiresAt = new Date(now.getTime() + leaseMs);

  let dbAvailable = true;

  try {
    const updated = await withDbTimeout(
      DistributedSyncLock.findOneAndUpdate(
        {
          lockKey,
          lockId, // Strictly requires matching worker lockId
        },
        {
          $set: {
            expiresAt: newExpiresAt,
          },
        },
        { new: true }
      ),
      1500
    );

    if (updated) {
      lockHandle.expiresAt = newExpiresAt;
      const mem = inMemoryLocksMap.get(lockKey);
      if (mem && mem.lockId === lockId) {
        mem.expiresAt = newExpiresAt;
      }
      return true;
    }

    // Document not found with matching lockId: ownership was lost!
    return false;
  } catch (err) {
    if (isProductionEnv()) {
      // Fail-closed in production: treat DB failure as lost lock ownership
      return false;
    }

    dbAvailable = false;
  }

  // In-memory fallback
  const mem = inMemoryLocksMap.get(lockKey);
  if (mem && mem.lockId === lockId) {
    mem.expiresAt = newExpiresAt;
    lockHandle.expiresAt = newExpiresAt;
    return true;
  }

  return false;
};

/**
 * Create a background heartbeat timer that periodically renews the lock lease
 *
 * @param {Object} lockHandle
 * @param {number} [leaseMs=300000]
 * @param {number} [intervalMs]
 * @returns {{ stop: Function, hasLostOwnership: Function }}
 */
export const createLockHeartbeat = (lockHandle, leaseMs = 5 * 60 * 1000, intervalMs = null) => {
  const heartbeatInterval = intervalMs || Math.max(Math.floor(leaseMs / 2), 1000);
  let active = true;
  let ownershipLost = false;

  const timer = setInterval(async () => {
    if (!active) return;
    try {
      const renewed = await renewDistributedLock(lockHandle, leaseMs);
      if (!renewed) {
        console.warn(`Distributed lock lease renewal failed for ${lockHandle.lockKey}. Ownership lost!`);
        ownershipLost = true;
        active = false;
        clearInterval(timer);
      }
    } catch (err) {
      console.warn(`Error during lock heartbeat for ${lockHandle.lockKey}:`, err.message);
    }
  }, heartbeatInterval);

  if (timer.unref) timer.unref();

  return {
    stop: () => {
      active = false;
      clearInterval(timer);
    },
    hasLostOwnership: () => ownershipLost,
  };
};

/**
 * Safely release a distributed lock.
 * Only deletes the lock if the lockId matches, preventing inadvertent deletion if lease expired.
 *
 * @param {Object} lockHandle
 * @param {string} lockHandle.lockKey
 * @param {string} lockHandle.lockId
 * @returns {Promise<boolean>}
 */
export const releaseDistributedLock = async (lockHandle) => {
  if (!lockHandle || !lockHandle.lockKey || !lockHandle.lockId) {
    return false;
  }

  const { lockKey, lockId } = lockHandle;

  try {
    await withDbTimeout(DistributedSyncLock.deleteOne({ lockKey, lockId }), 1500);
  } catch (err) {
    // DB offline fallback
  }

  const mem = inMemoryLocksMap.get(lockKey);
  if (mem && mem.lockId === lockId) {
    inMemoryLocksMap.delete(lockKey);
  }

  return true;
};

/**
 * Check if a distributed lock is currently active
 *
 * @param {Object} params
 * @param {string} params.sellerId
 * @param {string} params.channelId
 * @param {string} [params.resource='AMAZON_ORDER_SYNC']
 * @returns {Promise<boolean>}
 */
export const isDistributedLockActive = async ({ sellerId, channelId, resource = 'AMAZON_ORDER_SYNC' }) => {
  const cleanSellerId = String(sellerId);
  const cleanChannelId = channelId ? String(channelId) : 'DEFAULT';
  const lockKey = `${resource}:${cleanSellerId}:${cleanChannelId}`;
  const now = new Date();

  try {
    const active = await withDbTimeout(
      DistributedSyncLock.findOne({ lockKey, expiresAt: { $gt: now } }),
      1500
    );
    if (active) return true;
    if (isProductionEnv()) return false;
  } catch (err) {
    if (isProductionEnv()) {
      const lockErr = new Error('Distributed sync lock store is unavailable in production.');
      lockErr.code = 'LOCK_SERVICE_UNAVAILABLE';
      lockErr.status = 503;
      throw lockErr;
    }
    // fallback to memory map in non-production
  }

  const mem = inMemoryLocksMap.get(lockKey);
  if (mem && mem.expiresAt > now) {
    return true;
  }

  return false;
};
