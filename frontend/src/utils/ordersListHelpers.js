/**
 * Pure state/data-integrity helpers for OrdersList.jsx.
 *
 * Guarantees:
 * - Never falls back to mockOrders on empty API responses or API failures.
 * - Preserves real database/API orders verbatim.
 * - Distinguishes empty state from error state cleanly.
 * - Prevents duplicate concurrent sync requests on rapid clicks.
 */

export function extractOrdersFromResponse(res) {
  if (Array.isArray(res?.orders)) return res.orders;
  if (Array.isArray(res?.data?.orders)) return res.data.orders;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}

export async function fetchOrdersSafely(getOrdersFn) {
  try {
    const res = await getOrdersFn();
    const list = extractOrdersFromResponse(res);
    return {
      orders: list,
      error: null,
    };
  } catch (err) {
    return {
      orders: [],
      error: err?.message || 'Failed to load orders from the server.',
    };
  }
}

/**
 * Creates a concurrency-safe sync executor that ignores rapid duplicate triggers
 * while an existing sync promise is in flight.
 */
export function createSingleFlightSyncGuard(syncFn) {
  let inFlight = false;
  return async (...args) => {
    if (inFlight) {
      return { skipped: true, reason: 'ALREADY_IN_FLIGHT' };
    }
    inFlight = true;
    try {
      const result = await syncFn(...args);
      return { skipped: false, result };
    } finally {
      inFlight = false;
    }
  };
}
