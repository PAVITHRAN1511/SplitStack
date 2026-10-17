/**
 * SplitStack HTTP Error Hierarchy (Review 3, Step P11).
 * Standardizes API error responses with consistent HTTP status codes.
 */

export class HttpError extends Error {
  /**
   * @param {string} message - Human-readable error description
   * @param {number} [status=500] - HTTP status code
   * @param {Object} [fields=null] - Field-level validation error map
   */
  constructor(message, status = 500, fields = null) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.fields = fields;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad Request', fields = null) {
    super(message, 400, fields);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Authentication required. Please sign in.') {
    super(message, 401);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Access denied. You do not have permission to access this resource.') {
    super(message, 403);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Resource conflict', fields = null) {
    super(message, 409, fields);
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Validation failed', fields = null) {
    super(message, 400, fields);
  }
}
