export const errorHandler = (err, req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error('API Error:', err.message);
  }

  const statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  const isProd = process.env.NODE_ENV === 'production';

  // Sanitize production error response (hide stack trace, internal filesystem paths, tokens)
  const sanitizedMessage = isProd && statusCode === 500
    ? 'Internal Server Error. Please contact support.'
    : err.message || 'An unexpected error occurred';

  res.status(statusCode).json({
    success: false,
    message: sanitizedMessage,
    code: err.code || 'SERVER_ERROR',
    ...(!isProd && { stack: err.stack }),
  });
};

export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Resource not found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};
