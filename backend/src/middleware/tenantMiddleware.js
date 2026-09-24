import { errorResponse } from '../utils/apiResponse.js';

/**
 * Tenant Isolation Middleware
 * Enforces strict multi-tenant isolation by setting req.tenant from req.user
 * Never trusts client-supplied sellerId or storeId
 */
export const tenantMiddleware = (req, res, next) => {
  if (!req.user || !req.user.sellerId) {
    return errorResponse(res, 401, 'Tenant identity unresolved. Authentication required.');
  }

  req.tenant = {
    sellerId: req.user.sellerId,
    storeId: req.user.storeId || null,
  };

  next();
};
