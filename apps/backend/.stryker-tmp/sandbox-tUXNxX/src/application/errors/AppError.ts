/**
 * Application-layer error. No Nest dependency.
 * Presentation/filter maps this to HTTP response (envelope).
 */
// @ts-nocheck

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
