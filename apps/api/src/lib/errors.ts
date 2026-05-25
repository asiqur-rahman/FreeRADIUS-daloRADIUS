// Domain-level errors. The Fastify error handler maps these to HTTP.
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
}

export const Unauthorized = (msg = "Unauthorized") => new AppError(401, "unauthorized", msg);
export const Forbidden = (msg = "Forbidden") => new AppError(403, "forbidden", msg);
export const NotFound = (msg = "Not found") => new AppError(404, "not_found", msg);
export const Conflict = (msg: string) => new AppError(409, "conflict", msg);
export const BadRequest = (msg: string, details?: unknown) =>
  new AppError(400, "bad_request", msg, details);
