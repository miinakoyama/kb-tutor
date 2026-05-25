import type { SupabaseClient, User } from "@supabase/supabase-js";
import { vi } from "vitest";

export interface MockError {
  message: string;
}

export interface MockTableBehavior {
  rows: Array<Record<string, unknown>>;
  error?: MockError | null;
}

export interface MockSupabaseConfig {
  user?: User | null;
  authError?: MockError | null;
  tables?: Record<string, MockTableBehavior>;
  rpcs?: Record<
    string,
    (args: Record<string, unknown>) => Promise<{ data: unknown; error: MockError | null }>
  >;
}

interface OrderClause {
  column: string;
  ascending: boolean;
}

interface UpsertOptions {
  onConflict?: string;
}

function compareValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  const leftDate = typeof left === "string" ? Date.parse(left) : Number.NaN;
  const rightDate = typeof right === "string" ? Date.parse(right) : Number.NaN;
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
    return leftDate - rightDate;
  }

  return String(left).localeCompare(String(right));
}

function toRowArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
  }
  if (value && typeof value === "object") {
    return [value as Record<string, unknown>];
  }
  return [];
}

export function createMockSupabaseClient(config: MockSupabaseConfig = {}): {
  client: SupabaseClient;
  tables: Record<string, MockTableBehavior>;
} {
  const tables = config.tables ?? {};

  const builderFor = (tableName: string) => {
    if (!tables[tableName]) {
      tables[tableName] = { rows: [] };
    }
    const behavior = tables[tableName];
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const orderClauses: OrderClause[] = [];
    let updatePatch: Record<string, unknown> | null = null;
    let rangeClause: { from: number; to: number } | null = null;
    let limitClause: number | null = null;
    let countMode: { exact: boolean; headOnly: boolean } | null = null;
    let deleteMode = false;

    const filteredRows = () => {
      const matched = behavior.rows.filter((row) => filters.every((f) => f(row)));
      const ordered =
        orderClauses.length === 0
          ? matched
          : [...matched].sort((left, right) => {
        for (const clause of orderClauses) {
          const compared = compareValues(left[clause.column], right[clause.column]);
          if (compared !== 0) return clause.ascending ? compared : -compared;
        }
        return 0;
      });
      const ranged = rangeClause
        ? ordered.slice(rangeClause.from, rangeClause.to + 1)
        : ordered;
      if (limitClause !== null) {
        return ranged.slice(0, limitClause);
      }
      return ranged;
    };

    const builder: Record<string, unknown> = {
      select: vi.fn(
        (
          _columns?: string,
          options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
        ) => {
          if (options?.count) {
            countMode = {
              exact: options.count === "exact",
              headOnly: options.head === true,
            };
          }
          return builder;
        },
      ),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      }),
      neq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] !== value);
        return builder;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        const set = new Set(values);
        filters.push((row) => set.has(row[column]));
        return builder;
      }),
      ilike: vi.fn((column: string, value: unknown) => {
        if (typeof value !== "string") return builder;
        const pattern = value.toLowerCase().replaceAll("%", "");
        filters.push((row) =>
          String(row[column] ?? "").toLowerCase().includes(pattern),
        );
        return builder;
      }),
      gt: vi.fn((column: string, value: unknown) => {
        filters.push((row) => compareValues(row[column], value) > 0);
        return builder;
      }),
      gte: vi.fn((column: string, value: unknown) => {
        filters.push((row) => compareValues(row[column], value) >= 0);
        return builder;
      }),
      lt: vi.fn((column: string, value: unknown) => {
        filters.push((row) => compareValues(row[column], value) < 0);
        return builder;
      }),
      lte: vi.fn((column: string, value: unknown) => {
        filters.push((row) => compareValues(row[column], value) <= 0);
        return builder;
      }),
      is: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      }),
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orderClauses.push({
          column,
          ascending: options?.ascending !== false,
        });
        return builder;
      }),
      limit: vi.fn((count: number) => {
        limitClause = count;
        return builder;
      }),
      range: vi.fn((from: number, to: number) => {
        rangeClause = { from, to };
        return builder;
      }),
      delete: vi.fn(() => {
        deleteMode = true;
        return builder;
      }),
      maybeSingle: vi.fn(async () => {
        if (behavior.error) return { data: null, error: behavior.error };
        return { data: filteredRows()[0] ?? null, error: null };
      }),
      single: vi.fn(async () => {
        if (behavior.error) return { data: null, error: behavior.error };
        return { data: filteredRows()[0] ?? null, error: null };
      }),
      update: vi.fn((patch: Record<string, unknown>) => {
        updatePatch = patch;
        return builder;
      }),
      insert: vi.fn(async (payload: unknown) => {
        if (behavior.error) return { data: null, error: behavior.error };
        const rows = toRowArray(payload);
        for (const row of rows) {
          behavior.rows.push({ ...row });
        }
        return { data: rows, error: null };
      }),
      upsert: vi.fn(async (payload: unknown, options?: UpsertOptions) => {
        if (behavior.error) return { data: null, error: behavior.error };
        const rows = toRowArray(payload);
        const conflictKey = options?.onConflict?.trim();
        for (const row of rows) {
          if (!conflictKey) {
            behavior.rows.push({ ...row });
            continue;
          }
          const idx = behavior.rows.findIndex(
            (existing) => existing[conflictKey] === row[conflictKey],
          );
          if (idx >= 0) {
            behavior.rows[idx] = { ...behavior.rows[idx], ...row };
          } else {
            behavior.rows.push({ ...row });
          }
        }
        return { data: rows, error: null };
      }),
      then: undefined,
    };

    Object.defineProperty(builder, "then", {
      value: (
        resolve: (value: {
          data: unknown;
          error: unknown;
          count?: number | null;
        }) => void,
      ) => {
        if (behavior.error) {
          const errorCount = countMode ? null : undefined;
          resolve({ data: [], error: behavior.error, count: errorCount });
          return;
        }
        if (deleteMode) {
          const kept: Array<Record<string, unknown>> = [];
          const removed: Array<Record<string, unknown>> = [];
          for (const row of behavior.rows) {
            if (filters.length > 0 && filters.every((f) => f(row))) {
              removed.push(row);
            } else {
              kept.push(row);
            }
          }
          behavior.rows.length = 0;
          for (const row of kept) behavior.rows.push(row);
          resolve({ data: removed, error: null });
          return;
        }
        if (updatePatch) {
          const updatedRows: Array<Record<string, unknown>> = [];
          for (const row of behavior.rows) {
            if (!filters.every((f) => f(row))) continue;
            Object.assign(row, updatePatch);
            updatedRows.push({ ...row });
          }
          resolve({ data: updatedRows, error: null });
          return;
        }
        const rows = filteredRows();
        if (countMode) {
          resolve({
            data: countMode.headOnly ? null : rows,
            error: null,
            count: rows.length,
          });
          return;
        }
        resolve({ data: rows, error: null });
      },
    });

    return builder;
  };

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: config.user ?? null },
        error: config.authError ?? null,
      })),
    },
    from: vi.fn((tableName: string) => builderFor(tableName)),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      const handler = config.rpcs?.[name];
      if (!handler) {
        return { data: null, error: { message: `RPC not mocked: ${name}` } };
      }
      return handler(args);
    }),
  } as unknown as SupabaseClient;

  return { client, tables };
}
