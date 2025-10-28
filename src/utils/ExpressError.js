class ExpressError extends Error {
  constructor(statusCode, message) {
    super();
    this.statusCode = statusCode;
    this.message = message;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Predefined common errors
export class BadRequestError extends ExpressError {
  constructor(message = "Bad Request") {
    super(400, message);
  }
}

export class UnauthorizedError extends ExpressError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

export class ForbiddenError extends ExpressError {
  constructor(message = "Forbidden") {
    super(403, message);
  }
}

export class NotFoundError extends ExpressError {
  constructor(message = "Resource not found") {
    super(404, message);
  }
}

export class ConflictError extends ExpressError {
  constructor(message = "Conflict") {
    super(409, message);
  }
}

export class ValidationError extends ExpressError {
  constructor(message = "Validation failed") {
    super(422, message);
  }
}

export class InternalServerError extends ExpressError {
  constructor(message = "Internal server error") {
    super(500, message);
  }
}

export default ExpressError;