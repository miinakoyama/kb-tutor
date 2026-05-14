export const ANALYTICS_PAGE_SIZE = 1000;
export const ANALYTICS_IN_FILTER_CHUNK_SIZE = 200;

export function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export function appendPage<T>(
  target: T[],
  page: T[],
  maxRows: number,
): string | null {
  if (target.length + page.length > maxRows) {
    return `Analytics result exceeds ${maxRows.toLocaleString()} rows. Narrow the date range or school filter.`;
  }
  target.push(...page);
  return null;
}
