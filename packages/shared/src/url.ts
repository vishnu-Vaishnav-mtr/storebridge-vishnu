import { isIP } from "node:net";

const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export interface UrlValidationResult {
  ok: boolean;
  url?: URL;
  reason?: string;
}

export function validatePublicStoreUrl(
  input: string,
  allowPrivateNetwork = false,
): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, reason: "Enter a valid store URL." };
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    return {
      ok: false,
      reason: "Only HTTP and HTTPS store URLs are supported.",
    };
  }

  if (parsed.protocol !== "https:" && !allowPrivateNetwork) {
    return { ok: false, reason: "Use HTTPS for store connections." };
  }

  const host = parsed.hostname.toLowerCase();
  if (!allowPrivateNetwork && (PRIVATE_HOSTS.has(host) || isPrivateIp(host))) {
    return {
      ok: false,
      reason: "Private network addresses are blocked for safety.",
    };
  }

  return { ok: true, url: parsed };
}

function isPrivateIp(host: string): boolean {
  const version = isIP(host);
  if (version === 0) return false;
  if (version === 4) {
    const [a = 0, b = 0] = host.split(".").map(Number);
    return (
      a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    );
  }
  return (
    host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")
  );
}
