/** The one error every app's HTTP client throws for an API failure: the API's own
 *  sentence as `message`, plus whatever the body carried beside it. One class for
 *  every app, so `instanceof AppError` holds wherever the error is read. */
export class AppError extends Error {
  readonly status?: number
  readonly cause?: unknown
  /** The body's optional machine-readable `code` ({"error": "<sentence>", "code": "..."}), for a
   *  view that has more specific guidance for one failure than the sentence alone carries. */
  readonly code?: string
  /** The body's optional `details` object - extra facts beside the sentence, such as a
   *  suggested fix a view can offer in one click. */
  readonly details?: Record<string, unknown>

  constructor(
    message: string,
    status?: number,
    cause?: unknown,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.cause = cause
    this.code = code
    this.details = details
  }
}
