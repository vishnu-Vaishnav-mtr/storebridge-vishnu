const SECRET_KEYS = [
  "password",
  "secret",
  "token",
  "authorization",
  "consumer_key",
  "consumer_secret",
  "access_token",
  "admin_api_access_token",
];

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        const shouldRedact = SECRET_KEYS.some((secretKey) =>
          key.toLowerCase().includes(secretKey),
        );
        return [key, shouldRedact ? "[REDACTED]" : redactSecrets(entry)];
      }),
    ) as T;
  }

  if (typeof value === "string") {
    return value
      .replace(/ck_[A-Za-z0-9]+/g, "ck_[REDACTED]")
      .replace(/cs_[A-Za-z0-9]+/g, "cs_[REDACTED]")
      .replace(/shpat_[A-Za-z0-9]+/g, "shpat_[REDACTED]") as T;
  }

  return value;
}
