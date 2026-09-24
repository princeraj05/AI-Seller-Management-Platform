export class IntegrationError extends Error {
  constructor(message, statusCode = 500, code = 'INTEGRATION_ERROR', provider = null) {
    super(message);
    this.name = 'IntegrationError';
    this.statusCode = statusCode;
    this.code = code;
    this.provider = provider;
  }
}

export class AuthenticationError extends IntegrationError {
  constructor(message = 'Authentication failed with channel provider', provider = null) {
    super(message, 401, 'AUTHENTICATION_FAILED', provider);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends IntegrationError {
  constructor(message = 'Rate limit exceeded for provider API', retryAfter = 60, provider = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', provider);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ProviderNotSupportedError extends IntegrationError {
  constructor(operation = 'Operation', provider = null) {
    super(`${operation} is not supported by provider ${provider || 'channel'}`, 400, 'NOT_SUPPORTED', provider);
    this.name = 'ProviderNotSupportedError';
  }
}

export class SSRFValidationError extends IntegrationError {
  constructor(url) {
    super(`Security policy blocked connection to restricted host or IP: ${url}`, 400, 'SSRF_BLOCKED');
    this.name = 'SSRFValidationError';
  }
}
