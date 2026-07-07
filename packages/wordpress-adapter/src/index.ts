import type {
  AdapterConnectionResult,
  AuditEntityResult,
  NormalizedContent,
  NormalizedRedirect,
} from "@storebridge/shared";
import { stableHash, validatePublicStoreUrl } from "@storebridge/shared";

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

  async *pages(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedContent;
    raw: unknown;
    hash: string;
  }> {
    for await (const page of this.paginated("pages", pageSize)) {
      const normalized = normalizeWordPressContent(page);
      yield { normalized, raw: page, hash: stableHash(page) };
    }
  }

  async *posts(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedContent;
    raw: unknown;
    hash: string;
  }> {
    for await (const post of this.paginated("posts", pageSize)) {
      const normalized = normalizeWordPressContent(post);
      yield { normalized, raw: post, hash: stableHash(post) };
    }
  }

  async *redirects(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedRedirect;
    raw: unknown;
    hash: string;
  }> {
    for await (const redirect of this.paginated(
      "redirection/v1/redirect",
      pageSize,
      true,
    )) {
      const normalized = normalizeWordPressRedirect(redirect);
      if (!normalized) continue;
      yield { normalized, raw: redirect, hash: stableHash(redirect) };
    }
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

  private async *paginated(
    endpoint: string,
    pageSize: number,
    absolutePath = false,
  ): AsyncGenerator<Record<string, unknown>> {
    let page = 1;
    while (true) {
      const url = absolutePath ? new URL(`/wp-json/${endpoint}`, this.baseUrl) : this.url(endpoint);
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", String(pageSize));
      const response = await fetch(url, { headers: this.headers() });
      if (absolutePath && response.status === 404) return;
      if (!response.ok) throw new Error(`WordPress returned ${response.status}.`);
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(rows) || rows.length === 0) return;
      for (const row of rows) yield row;
      page += 1;
    }
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

function normalizeWordPressContent(row: Record<string, unknown>): NormalizedContent {
  const normalized: NormalizedContent = {
    sourceId: String(row.id),
    title: rendered(row.title) || "Untitled content",
    status: row.status === "publish" ? "PUBLISHED" : "DRAFT",
  };
  const slug = stringValue(row.slug);
  if (slug) normalized.handle = slug;
  const bodyHtml = rendered(row.content);
  if (bodyHtml) normalized.bodyHtml = bodyHtml;
  const publishedAt = stringValue(row.date_gmt);
  if (publishedAt) normalized.publishedAt = `${publishedAt}Z`;
  const seo = normalizeSeo(row);
  if (seo.title || seo.description) normalized.seo = seo;
  return normalized;
}

function normalizeWordPressRedirect(
  row: Record<string, unknown>,
): NormalizedRedirect | null {
  const source = stringValue(row.url) ?? stringValue(row.source_url);
  const target = stringValue(row.action_data) ?? stringValue(row.target);
  if (!source || !target) return null;
  return {
    sourceId: String(row.id ?? source),
    path: source,
    target,
  };
}

function rendered(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const output = (value as { rendered?: unknown }).rendered;
  return typeof output === "string" ? output : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function normalizeSeo(row: Record<string, unknown>) {
  const yoast = row.yoast_head_json as Record<string, unknown> | undefined;
  const seo: { title?: string; description?: string } = {};
  if (typeof yoast?.title === "string") seo.title = yoast.title;
  if (typeof yoast?.description === "string") seo.description = yoast.description;
  return seo;
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
