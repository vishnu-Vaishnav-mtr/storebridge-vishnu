import { z } from "zod";

export const wooConnectionSchema = z.object({
  name: z.string().min(2),
  storeUrl: z.string().url(),
  consumerKey: z.string().min(6),
  consumerSecret: z.string().min(6),
  apiVersion: z.string().default("wc/v3"),
  verifySsl: z.boolean().default(true),
  requestTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
  wordpressUsername: z.string().optional(),
  wordpressApplicationPassword: z.string().optional(),
  wordpressBaseUrl: z.string().optional(),
});

export const shopifyTokenConnectionSchema = z.object({
  name: z.string().min(2),
  shopDomain: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/),
  adminAccessToken: z.string().min(10),
  apiVersion: z.string().default("2026-01"),
});

export const migrationControlSchema = z.object({
  migrationId: z.string().min(1),
  action: z.enum([
    "start",
    "pause",
    "resume",
    "cancel",
    "retry-failed",
    "verify",
    "dry-run",
  ]),
});
