export interface ProgressInput {
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  duplicatesPrevented: number;
}

export function calculateProgress(input: ProgressInput): {
  percent: number;
  successRate: number;
} {
  if (input.totalRecords <= 0) return { percent: 0, successRate: 0 };
  const complete = Math.min(
    input.totalRecords,
    input.processedRecords + input.failedRecords,
  );
  const percent = Math.round((complete / input.totalRecords) * 100);
  const successes = Math.max(
    0,
    input.processedRecords - input.duplicatesPrevented,
  );
  const successRate = Math.round((successes / Math.max(1, complete)) * 100);
  return { percent, successRate };
}
