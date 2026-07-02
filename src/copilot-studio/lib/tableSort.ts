/**
 * Shared table-sorting helpers so every data table in the Copilot Studio hub
 * behaves the same way: click a column header to sort, click again to flip
 * direction. Numeric columns default to descending (biggest first), text
 * columns to ascending (A→Z).
 */
import { useState } from "react";

export type SortDir = "asc" | "desc";
export interface SortState<K extends string = string> {
  key: K;
  dir: SortDir;
}

export function useSort<K extends string>(initialKey: K, initialDir: SortDir = "asc") {
  const [sort, setSort] = useState<SortState<K>>({ key: initialKey, dir: initialDir });
  function onSort(key: K, numeric = false) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: numeric ? "desc" : "asc" }
    );
  }
  return { sort, setSort, onSort };
}

/** Stable sort a list by an accessor that returns a string or number for the active key. */
export function sortBy<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  val: (r: T, key: K) => string | number | null | undefined
): T[] {
  const mul = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = val(a, sort.key);
    const bv = val(b, sort.key);
    const an = av ?? "";
    const bn = bv ?? "";
    if (typeof an === "number" && typeof bn === "number") return (an - bn) * mul;
    return String(an).localeCompare(String(bn), undefined, { numeric: true }) * mul;
  });
}
