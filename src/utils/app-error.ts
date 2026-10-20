/** An expected error that should reach the client with a specific status and code. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Please log in to continue.") {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "You don't have access to this.") {
    return new AppError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Not found.") {
    return new AppError(404, "NOT_FOUND", message);
  }

  static conflict(message: string) {
    return new AppError(409, "CONFLICT", message);
  }
}
