import type {
  AdapterConnectionResult,
  AuditEntityResult,
} from "@storebridge/shared";
import { validatePublicStoreUrl } from "@storebridge/shared";

export interface WordPressConnectionOptions {
  storeUrl: string;
  username?: string;
  applicationPassword?: string;
  basePath?: string;
  timeoutMs?: number;
  allowPrivateNetwork?: boolean;
}

export class WordPressAdapter {
  private readonly baseUrl: URL;

  constructor(private readonly options: WordPressConnectionOptions) {
    const validation = validatePublicStoreUrl(
      options.storeUrl,
      options.allowPrivateNetwork,
    );
    if (!validation.ok || !validation.url)
      throw new Error(validation.reason ?? "Invalid WordPress URL.");
    this.baseUrl = validation.url;
  }

  async testConnection(): Promise<AdapterConnectionResult> {
    const started = performance.now();
    try {
      const response = await this.fetchJson<Record<string, unknown>>("/");
      return {
        ok: true,
        status: "CONNECTED",
        storeName: String(response.name ?? this.baseUrl.hostname),
        metadata: {
          url: this.baseUrl.origin,
          wordpressVersion: response.gmt_offset
            ? "REST API available"
            : "Unknown",
          namespaces: response.namespaces,
        },
        warnings: [],
        missingPermissions: [],
        responseTimeMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      return {
        ok: false,
        status: "CONNECTION_FAILED",
        metadata: { url: this.baseUrl.origin },
        warnings: [],
        missingPermissions: [],
        responseTimeMs: Math.round(performance.now() - started),
        error:
          error instanceof Error
            ? error.message
            : "WordPress connection failed.",
      };
    }
  }

  async auditContent(): Promise<AuditEntityResult[]> {
    const [pages, posts, media, categories, tags] = await Promise.all([
      this.count("pages"),
      this.count("posts"),
      this.count("media"),
      this.count("categories"),
      this.count("tags"),
    ]);

    return [
      result("PAGE", pages),
      result("POST", posts),
      result("MEDIA", media),
      result("CUSTOM_FIELD", 0, 0, [
        "Custom post metadata is scanned during record extraction.",
      ]),
      result("COLLECTION", categories + tags),
    ];
  }

  private async count(endpoint: string): Promise<number> {
    const url = this.url(endpoint);
    url.searchParams.set("page", "1");
    url.searchParams.set("per_page", "1");
    const response = await fetch(url, { headers: this.headers() });
    if (!response.ok) return 0;
    return Number(response.headers.get("x-wp-total") ?? 0);
  }

  private async fetchJson<T>(endpoint: string): Promise<T> {
    const response = await fetch(this.url(endpoint), {
      headers: this.headers(),
    });
    if (!response.ok) throw new Error(`WordPress returned ${response.status}.`);
    return (await response.json()) as T;
  }

  private url(endpoint: string): URL {
    const basePath = this.options.basePath ?? "/wp-json/wp/v2";
    return new URL(
      `${basePath.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`,
      this.baseUrl,
    );
  }

  private headers(): HeadersInit {
    if (!this.options.username || !this.options.applicationPassword)
      return { accept: "application/json" };
    const token = Buffer.from(
      `${this.options.username}:${this.options.applicationPassword}`,
    ).toString("base64");
    return { accept: "application/json", authorization: `Basic ${token}` };
  }
}

function result(
  entityType: string,
  detectedCount: number,
  unsupportedCount = 0,
  warnings: string[] = [],
): AuditEntityResult {
  return {
    entityType,
    detectedCount,
    supportedCount: Math.max(0, detectedCount - unsupportedCount),
    needsMapping: warnings.length,
    warningCount: warnings.length,
    unsupportedCount,
    warnings,
  };
}
