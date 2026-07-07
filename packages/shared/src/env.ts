import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  AUTH_SECRET: z.string().min(24),
  APP_URL: z.string().url().default("http://localhost:3000"),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(32),
  OBJECT_STORAGE_PROVIDER: z.string().default("minio"),
  OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  OBJECT_STORAGE_REGION: z.string().default("us-east-1"),
  OBJECT_STORAGE_BUCKET: z.string().default("storebridge"),
  OBJECT_STORAGE_ACCESS_KEY: z.string().optional(),
  OBJECT_STORAGE_SECRET_KEY: z.string().optional(),
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  SHOPIFY_API_VERSION: z.string().default("2026-01"),
  LOG_LEVEL: z.string().default("info"),
  DEMO_MODE: z.coerce.boolean().default(false),
  ALLOW_PRIVATE_NETWORK_URLS: z.coerce.boolean().default(false),
});

export type StoreBridgeEnv = z.infer<typeof envSchema>;

export function parseEnv(
  source: NodeJS.ProcessEnv = process.env,
): StoreBridgeEnv {
  return envSchema.parse(source);
}
