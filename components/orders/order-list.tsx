import Link from 'next/link';
import { ChevronRight, MessageSquareWarning } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status';
import type { OrderSummary } from '@/lib/domain/orders';
import { formatCount, formatDateTime, formatYards, timeAgo } from '@/lib/format';

/**
 * Orders as a dense, scannable list. Each row is one link to the order. Rejected
 * orders carry the verifier's reason right in the row, because that is the next
 * thing the supervisor needs to act on.
 */
export function OrderList({ orders, hrefFor, emphasiseWaiting = false }: { orders: OrderSummary[]; hrefFor: (order: OrderSummary) => string; emphasiseWaiting?: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {orders.map(order => (
        <li key={order.id}>
          <Link
            href={hrefFor(order)}
            className={`group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-[12px] border bg-surface px-4 py-3.5 transition-colors duration-150 hover:border-ink sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:px-5 ${
              order.status === 'REJECTED' ? 'border-shortage-line' : 'border-line'
            }`}
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="tabular font-mono text-base font-semibold text-ink">{order.orderNo}</span>
                <span className="text-sm text-muted">{order.recipeName}</span>
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted">{order.fabricRollId}</p>
            </div>
            <div className="hidden text-sm sm:block">
              <p className="label-caps text-muted">Batch</p>
              <p className="tabular font-mono text-ink">{formatCount(order.targetQty)} pcs</p>
            </div>
            <div className="hidden text-sm sm:block">
              <p className="label-caps text-muted">{emphasiseWaiting ? 'Waiting' : 'Fabric used'}</p>
              <p className="tabular font-mono text-ink">
                {emphasiseWaiting ? (
                  <time dateTime={order.submittedAt ?? undefined} title={formatDateTime(order.submittedAt)}>
                    {timeAgo(order.submittedAt)}
                  </time>
                ) : (
                  formatYards(order.actualFabricYds)
                )}
              </p>
            </div>
            <div className="justify-self-end">
              <StatusBadge status={order.status} />
            </div>
            <ChevronRight aria-hidden className="hidden size-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink sm:block" />
            <p className="tabular col-span-2 font-mono text-xs text-muted sm:hidden">
              {formatCount(order.targetQty)} pcs · {emphasiseWaiting ? `waiting ${timeAgo(order.submittedAt)}` : formatYards(order.actualFabricYds)}
            </p>
            {order.latestRejectionNote && (
              <p className="col-span-full flex gap-2 rounded-[8px] bg-shortage-tint px-3 py-2 text-sm text-ink">
                <MessageSquareWarning aria-hidden className="mt-0.5 size-4 shrink-0 text-shortage" />
                <span>
                  <span className="font-semibold text-shortage">Rejected: </span>
                  {order.latestRejectionNote}
                </span>
              </p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
