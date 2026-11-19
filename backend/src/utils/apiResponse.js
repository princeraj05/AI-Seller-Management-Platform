/**
 * Standard API Response Helper
 */
export const successResponse = (res, statusCode = 200, message = 'Success', data = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...data,
  });
};

export const errorResponse = (res, statusCode = 400, message = 'Error', errors = null, code = null) => {
  const errCode = code || (typeof errors === 'string' ? errors : null);
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors && typeof errors === 'object' && { errors }),
    ...(errCode && { code: errCode }),
  });
};
