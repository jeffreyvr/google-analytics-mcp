export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function stringField(
  record: Record<string, unknown> | null,
  key: string,
): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

export function numberField(
  record: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

export function tsv(headers: string[], rows: string[][]): string {
  const lines = [headers.join("\t")];
  for (const row of rows) lines.push(row.join("\t"));
  return lines.join("\n");
}

export function formatCount(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

export function formatCtr(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatPosition(value: number): string {
  return value.toFixed(1);
}
