import { FlagChip } from '@/components/ui/status';
import type { CountFlag } from '@/lib/domain/constants';
import { formatCount } from '@/lib/format';
import { formatSigned } from '@/lib/domain/rules';

export interface CountRow {
  componentId: number;
  componentName: string;
  piecesPerGarment?: number;
  expectedQty: number;
  actualQty: number | null;
  status: CountFlag;
  variance: number | null;
}

/** Read-only component counts. A table on wide screens, stacked rows on phones. */
export function CountsTable({ rows, caption }: { rows: CountRow[]; caption: string }) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="hidden sm:table-header-group">
        <tr className="border-b border-line text-left">
          <th scope="col" className="label-caps py-2 pr-3 font-semibold text-muted">
            Component
          </th>
          <th scope="col" className="label-caps px-3 py-2 text-right font-semibold text-muted">
            Expected
          </th>
          <th scope="col" className="label-caps px-3 py-2 text-right font-semibold text-muted">
            Counted
          </th>
          <th scope="col" className="label-caps px-3 py-2 text-right font-semibold text-muted">
            Variance
          </th>
          <th scope="col" className="label-caps py-2 pl-3 text-right font-semibold text-muted">
            Status
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.componentId} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b border-line py-3 last:border-0 sm:table-row sm:py-0">
            <th scope="row" className="text-left font-medium text-ink sm:py-3 sm:pr-3">
              {row.componentName}
              {row.piecesPerGarment !== undefined && (
                <span className="block text-xs font-normal text-muted">{row.piecesPerGarment} per garment</span>
              )}
            </th>
            <td className="tabular hidden px-3 text-right font-mono text-ink sm:table-cell">{formatCount(row.expectedQty)}</td>
            <td className="tabular hidden px-3 text-right font-mono text-ink sm:table-cell">{formatCount(row.actualQty)}</td>
            <td className="tabular hidden px-3 text-right font-mono text-ink sm:table-cell">
              {row.variance == null ? '—' : formatSigned(row.variance)}
            </td>
            <td className="row-span-2 self-center text-right sm:py-3 sm:pl-3">
              <FlagChip flag={row.status} variance={row.variance} compact />
            </td>
            <td className="tabular font-mono text-xs text-muted sm:hidden">
              {formatCount(row.actualQty)} counted of {formatCount(row.expectedQty)}
              {row.variance ? ` (${formatSigned(row.variance)})` : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
