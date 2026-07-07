import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: "aes-256-gcm";
}

function normalizeKey(rawKey: string): Buffer {
  const asBase64 = Buffer.from(rawKey, "base64");
  if (asBase64.length === 32) return asBase64;

  const asUtf8 = Buffer.from(rawKey, "utf8");
  if (asUtf8.length === 32) return asUtf8;

  throw new Error("CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes.");
}

export function encryptSecret(
  plainText: string,
  rawKey: string,
): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", normalizeKey(rawKey), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: "aes-256-gcm",
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret, rawKey: string): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    normalizeKey(rawKey),
    Buffer.from(secret.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(
  value: string,
  visiblePrefix = 5,
  visibleSuffix = 4,
): string {
  if (value.length <= visiblePrefix + visibleSuffix) return "••••";
  return `${value.slice(0, visiblePrefix)}••••••••${value.slice(-visibleSuffix)}`;
}
