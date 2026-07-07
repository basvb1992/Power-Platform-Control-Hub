/**
 * Sort-aware table header cell. Pair with `useSort` / `sortBy` from
 * `../lib/tableSort` to make any table column clickable-to-sort.
 */
import type { ReactNode } from "react";
import type { SortState } from "../lib/tableSort";

/** A clickable, sort-aware table header cell. */
export function SortTh<K extends string>({
  col,
  label,
  sort,
  onSort,
  numeric,
  title,
}: {
  col: K;
  label: ReactNode;
  sort: SortState<K>;
  onSort: (key: K, numeric?: boolean) => void;
  numeric?: boolean;
  title?: string;
}) {
  const active = sort.key === col;
  return (
    <th
      className={`sortable${numeric ? " num" : ""}${active ? " sorted" : ""}`}
      onClick={() => onSort(col, numeric)}
      title={title ?? `Sort by ${typeof label === "string" ? label : col}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      <span className={`sort-arrow${active ? " on" : ""}`} aria-hidden="true">
        {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}
