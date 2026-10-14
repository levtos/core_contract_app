import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Sortable, filterable table (TanStack Table). Rows can be keyboard-activated. */
export function DataTable<T>({
  data,
  columns,
  globalFilter,
  onRowClick,
  empty,
  caption,
  rowClassName,
  getRowId,
}: {
  data: T[];
  columns: ColumnDef<T, any>[];
  globalFilter?: string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  caption: string;
  rowClassName?: (row: T) => string | undefined;
  getRowId?: (row: T, index: number) => string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: globalFilter ?? '' },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
    getRowId,
  });
  const rows = table.getRowModel().rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-b border-line text-left text-xs text-muted">
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <th key={header.id} scope="col" aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'} className="px-3 py-2 font-medium">
                    {header.isPlaceholder ? null : canSort ? (
                      <button type="button" className="inline-flex cursor-pointer items-center gap-1 hover:text-fg" onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' ? <ArrowUp size={12} /> : sorted === 'desc' ? <ArrowDown size={12} /> : <ChevronsUpDown size={12} className="opacity-40" />}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(row.original)) : undefined}
              className={cn('border-b border-line/60 transition-colors', onRowClick && 'cursor-pointer hover:bg-raised focus-visible:bg-raised', rowClassName?.(row.original))}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} title={typeof cell.getValue() === "string" ? String(cell.getValue()) : undefined} className="break-words px-3 py-2 align-middle [overflow-wrap:anywhere]">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && empty}
    </div>
  );
}
