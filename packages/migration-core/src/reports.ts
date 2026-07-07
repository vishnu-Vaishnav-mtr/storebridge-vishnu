export interface ReconciliationRow {
  entity: string;
  source: number;
  migrated: number;
  updated: number;
  skipped: number;
  failed: number;
}

export function buildReconciliation(rows: ReconciliationRow[]) {
  return rows.map((row) => ({
    ...row,
    difference:
      row.source - row.migrated - row.updated - row.skipped - row.failed,
  }));
}

export function toCsv(
  rows: Array<Record<string, string | number | boolean | null | undefined>>,
): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] ?? {});
  const lines = rows.map((row) =>
    headers
      .map((header) => {
        const value = row[header] ?? "";
        return `"${String(value).replaceAll('"', '""')}"`;
      })
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}
