export type RetryCategory =
  | "VALIDATION"
  | "AUTHENTICATION"
  | "PERMISSION"
  | "RATE_LIMIT"
  | "NETWORK"
  | "SOURCE_DATA"
  | "MAPPING"
  | "DESTINATION_USER"
  | "UNSUPPORTED_FEATURE"
  | "UNKNOWN";

export function isRetryable(
  category: RetryCategory,
  httpStatus?: number,
): boolean {
  if (
    category === "NETWORK" ||
    category === "RATE_LIMIT" ||
    category === "UNKNOWN"
  )
    return true;
  if (
    httpStatus &&
    [408, 409, 425, 429, 500, 502, 503, 504].includes(httpStatus)
  )
    return true;
  return false;
}

export function retryDelayMs(attempt: number, baseMs = 1000): number {
  const cappedAttempt = Math.min(attempt, 8);
  return Math.round(baseMs * 2 ** cappedAttempt + Math.random() * 250);
}
