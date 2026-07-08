import { describe, expect, it } from "vitest";
import { buildRedisConnectionOptions, safeRedisError } from "../src";

describe("redis connection parsing", () => {
  it("does not enable TLS for redis URLs", () => {
    const connection = buildRedisConnectionOptions(
      "redis://default:secret@example.upstash.io:6380",
    );

    expect(connection).toMatchObject({
      host: "example.upstash.io",
      port: 6380,
      username: "default",
      password: "secret",
      maxRetriesPerRequest: null,
    });
    expect(connection).not.toHaveProperty("tls");
  });

  it("enables TLS for rediss URLs", () => {
    const connection = buildRedisConnectionOptions(
      "rediss://default:secret@example.upstash.io:6380",
    );

    expect(connection.tls).toEqual({});
  });

  it("decodes encoded username and password values", () => {
    const connection = buildRedisConnectionOptions(
      "rediss://user%40name:p%40ss%2Fword@example.upstash.io:6380",
    );

    expect(connection.username).toBe("user@name");
    expect(connection.password).toBe("p@ss/word");
  });

  it("uses port 6379 when the URL omits a port", () => {
    const connection = buildRedisConnectionOptions("redis://example.upstash.io");

    expect(connection.port).toBe(6379);
  });

  it("removes Redis credentials from safe log errors", () => {
    const error = new Error(
      "read ECONNRESET rediss://user%40name:p%40ss%2Fword@example.upstash.io:6380",
    );
    const serialized = JSON.stringify(safeRedisError(error));

    expect(serialized).not.toContain("user%40name");
    expect(serialized).not.toContain("user@name");
    expect(serialized).not.toContain("p%40ss%2Fword");
    expect(serialized).not.toContain("p@ss/word");
    expect(serialized).toContain("[REDACTED]");
  });
});
