export interface RedirectRule {
  from: string;
  to: string;
}

export function detectRedirectLoops(rules: RedirectRule[]): RedirectRule[] {
  const destinations = new Map(
    rules.map((rule) => [normalize(rule.from), normalize(rule.to)]),
  );
  const loops: RedirectRule[] = [];

  for (const rule of rules) {
    const seen = new Set<string>();
    let cursor = normalize(rule.from);
    while (destinations.has(cursor)) {
      if (seen.has(cursor)) {
        loops.push(rule);
        break;
      }
      seen.add(cursor);
      cursor = destinations.get(cursor) ?? cursor;
    }
  }

  return loops;
}

function normalize(path: string): string {
  return path.trim().replace(/\/+$/, "") || "/";
}
