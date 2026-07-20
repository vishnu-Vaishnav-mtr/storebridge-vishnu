"use client";

import { LoaderCircle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type SearchResult = {
  id: string;
  type: "Store" | "Migration" | "Report";
  title: string;
  detail: string;
  href: string;
};

export function GlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Search failed");
        const body = (await response.json()) as { results: SearchResult[] };
        setResults(body.results);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const navigate = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    if (result.type === "Report") window.location.assign(result.href);
    else router.push(result.href);
  };

  return (
    <div ref={containerRef} className="relative hidden min-w-72 md:block">
      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted">
        {loading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && results[0]) navigate(results[0]);
          }}
          className="w-full bg-transparent outline-none placeholder:text-muted"
          placeholder="Search migrations, stores, reports"
          aria-label="Search workspace"
        />
      </label>

      {open && query.trim().length >= 2 ? (
        <div className="absolute right-0 top-12 z-50 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-2 shadow-2xl">
          {results.map((result) => (
            <button
              key={`${result.type}-${result.id}`}
              type="button"
              onClick={() => navigate(result)}
              className="focus-ring block w-full border-b border-white/5 px-3 py-2.5 text-left last:border-0 hover:bg-white/8"
            >
              <span className="block truncate text-sm font-medium text-surface">
                {result.title}
              </span>
              <span className="block truncate text-xs text-muted">
                {result.type} / {result.detail}
              </span>
            </button>
          ))}
          {!loading && results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted">
              No matching records found.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
