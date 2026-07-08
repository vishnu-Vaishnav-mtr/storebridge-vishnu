import { redactSecrets } from "./redaction";

export type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
};

export function buildRedisConnectionOptions(rawRedisUrl: string): RedisConnectionOptions {
  const redisUrl = new URL(rawRedisUrl);

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    ...(redisUrl.username
      ? { username: decodeURIComponent(redisUrl.username) }
      : {}),
    ...(redisUrl.password
      ? { password: decodeURIComponent(redisUrl.password) }
      : {}),
    ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

export function safeRedisError(error: unknown) {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: unknown }).code;
    return {
      name: error.name,
      message: sanitizeRedisLogValue(error.message),
      ...(typeof maybeCode === "string" ? { code: maybeCode } : {}),
    };
  }

  return {
    name: "RedisError",
    message: sanitizeRedisLogValue(String(error)),
  };
}

function sanitizeRedisLogValue(value: string) {
  return redactSecrets(value).replace(
    /(rediss?:\/\/)([^:@\s/]+)(?::([^@\s/]*))?@/gi,
    "$1[REDACTED]@",
  );
}
