import { describe, expect, it } from "vitest";
import {
  canTransitionMigration,
  decryptSecret,
  encryptSecret,
  maskSecret,
  redactSecrets,
  stableHash,
  validatePublicStoreUrl,
} from "../src";

const key = Buffer.from("12345678901234567890123456789012").toString("base64");

describe("credential encryption", () => {
  it("round trips AES-256-GCM secrets", () => {
    const encrypted = encryptSecret("shpat_sensitive", key);
    expect(encrypted.ciphertext).not.toContain("shpat_sensitive");
    expect(decryptSecret(encrypted, key)).toBe("shpat_sensitive");
  });

  it("masks secrets for browser display", () => {
    expect(maskSecret("shpat_1234567891AB")).toBe("shpat••••••••91AB");
  });
});

describe("safety helpers", () => {
  it("redacts nested credential fields", () => {
    expect(
      redactSecrets({
        token: "shpat_abc",
        nested: { consumer_secret: "cs_x" },
      }),
    ).toEqual({
      token: "[REDACTED]",
      nested: { consumer_secret: "[REDACTED]" },
    });
  });

  it("blocks private store URLs by default", () => {
    expect(validatePublicStoreUrl("http://127.0.0.1/wp-json").ok).toBe(false);
  });

  it("creates stable source hashes", () => {
    expect(stableHash({ b: 2, a: 1 })).toBe(stableHash({ a: 1, b: 2 }));
  });

  it("enforces migration status transitions", () => {
    expect(canTransitionMigration("RUNNING", "PAUSED")).toBe(false);
    expect(canTransitionMigration("RUNNING", "PAUSING")).toBe(true);
  });
});
