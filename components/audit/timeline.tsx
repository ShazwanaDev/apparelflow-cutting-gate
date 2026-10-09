import { CircleCheck, Clock3, Lock, PlusCircle, Send, Shirt, Undo2 } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/domain/constants';
import type { OrderDetail } from '@/lib/domain/orders';
import { formatDateTime, formatPercent } from '@/lib/format';
import { CountsTable } from '@/components/orders/counts-table';

const EVENT_META: Record<string, { label: string; Icon: typeof Clock3; tone: string }> = {
  CREATED: { label: 'Order created', Icon: PlusCircle, tone: 'bg-sunken text-ink' },
  SUBMITTED: { label: 'Sent for verification', Icon: Send, tone: 'bg-aqua text-ink' },
  RESUBMITTED: { label: 'Re-cut and resubmitted', Icon: Send, tone: 'bg-aqua text-ink' },
  APPROVED: { label: 'Verified and released to sewing', Icon: CircleCheck, tone: 'bg-match-tint text-match' },
  REJECTED: { label: 'Rejected at QC', Icon: Undo2, tone: 'bg-shortage-tint text-shortage' },
  SEWING_STARTED: { label: 'Sewing assembly started', Icon: Shirt, tone: 'bg-mint text-ink' },
};

/**
 * The order's history, oldest first. Every entry comes from append-only tables
 * that the database refuses to update or delete. Each verification decision
 * shows the counts exactly as they were when it was made.
 */
export function AuditTimeline({ order }: { order: OrderDetail }) {
  // Match each decision event to its log row, which carries the frozen counts.
  const decisions = [...order.logs].reverse();
  let decisionIndex = 0;

  return (
    <section aria-labelledby="audit-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 id="audit-heading" className="font-display text-3xl text-ink">
          Audit trail
        </h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Lock aria-hidden className="size-3.5" /> Append-only, cannot be edited
        </span>
      </div>
      <ol className="mt-5 flex flex-col">
        {order.events.map((event, index) => {
          const meta = EVENT_META[event.eventType] ?? { label: event.eventType, Icon: Clock3, tone: 'bg-sunken text-ink' };
          const log = event.eventType === 'APPROVED' || event.eventType === 'REJECTED' ? decisions[decisionIndex++] : undefined;
          const last = index === order.events.length - 1;
          return (
            <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
              {!last && <span aria-hidden className="absolute top-10 bottom-0 left-5 w-px bg-line" />}
              <span className={`grid size-10 shrink-0 place-items-center rounded-full ${meta.tone}`}>
                <meta.Icon aria-hidden className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className="font-semibold text-ink">{meta.label}</p>
                <p className="text-sm text-muted">
                  {event.actorName} · {ROLE_LABELS[event.actorRole]} ·{' '}
                  <time dateTime={event.createdAt} className="tabular">
                    {formatDateTime(event.createdAt)}
                  </time>
                </p>
                {event.note && (
                  <blockquote className="mt-2 rounded-[12px] border-l-4 border-ink bg-sunken px-4 py-2 text-sm text-ink">{event.note}</blockquote>
                )}
                {log && (
                  <details className="group mt-2">
                    <summary className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                      Counts at this decision · wastage {formatPercent(log.wastagePct)}
                    </summary>
                    <div className="mt-2 rounded-[12px] border border-line bg-surface px-4 py-1">
                      <CountsTable rows={log.items} caption={`Counts recorded at ${formatDateTime(log.createdAt)}`} />
                    </div>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
