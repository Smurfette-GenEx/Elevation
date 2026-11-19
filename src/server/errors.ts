export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "BUSINESS_RULE"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  BUSINESS_RULE: 422,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
};

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
    this.name = "AppError";
  }
  get status() {
    return STATUS[this.code];
  }
}

export const unauthenticated = () => new AppError("UNAUTHENTICATED", "Authentication required");
export const forbidden = (msg = "You do not have access to this resource") => new AppError("FORBIDDEN", msg);
// NOT_FOUND is also returned for out-of-scope records so their existence is not disclosed.
export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`);
export const businessRule = (msg: string, details?: unknown) => new AppError("BUSINESS_RULE", msg, details);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
export const validation = (msg: string, details?: unknown) => new AppError("VALIDATION", msg, details);
