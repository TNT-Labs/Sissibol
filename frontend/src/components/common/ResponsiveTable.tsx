import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
  mobileLabel?: string;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  onRowClick?: (item: T) => void;
  emptyState?: React.ReactNode;
}

/**
 * Tabella responsive che:
 * - Su desktop: mostra la tabella normale
 * - Su mobile: mostra le righe come cards con label
 */
export function ResponsiveTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyState,
}: ResponsiveTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${column.className || ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item) => (
              <tr
                key={keyExtractor(item)}
                className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-6 py-4 whitespace-nowrap text-sm ${column.className || ''}`}
                  >
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {data.map((item) => (
          <div
            key={keyExtractor(item)}
            className={`bg-white rounded-lg shadow p-4 ${onRowClick ? 'cursor-pointer active:bg-gray-50' : ''}`}
            onClick={() => onRowClick?.(item)}
          >
            {columns
              .filter((col) => !col.hideOnMobile)
              .map((column, index) => (
                <div
                  key={column.key}
                  className={`flex justify-between items-start ${index > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}`}
                >
                  <span className="text-xs font-medium text-gray-500 uppercase">
                    {column.mobileLabel || column.header}
                  </span>
                  <span className="text-sm text-gray-900 text-right ml-4">
                    {column.render(item)}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </>
  );
}
