import { errorResponse } from '../utils/apiResponse.js';

/**
 * Role-Based Access Control (RBAC) Middleware
 * @param  {...string} allowedRoles Roles permitted to access the route ('seller', 'admin', 'staff')
 */
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, 'Authentication required before checking authorization.');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(
        res,
        403,
        `Forbidden: Role '${req.user.role}' is not authorized to perform this action.`
      );
    }

    next();
  };
};
