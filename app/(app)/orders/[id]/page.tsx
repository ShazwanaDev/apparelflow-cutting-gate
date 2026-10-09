import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock3, MessageSquareWarning, Scissors } from 'lucide-react';
import { AuditTimeline } from '@/components/audit/timeline';
import { CountsTable } from '@/components/orders/counts-table';
import { OrderFacts } from '@/components/orders/order-facts';
import { SubmitForm } from '@/components/orders/submit-form';
import { StatusBadge } from '@/components/ui/status';
import { Panel } from '@/components/ui/states';
import { getOrder } from '@/lib/domain/orders';
import { formatDateTime } from '@/lib/format';
import { getDb } from '@/lib/server/db';
import { loadForPage, requirePageActor } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Cutting order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor('order:create');
  const { id } = await params;
  if (!/^[1-9]\d{0,8}$/.test(id)) notFound();
  const order = await loadForPage(getOrder(getDb(), actor, Number(id)));
  const rejection = order.status === 'REJECTED' ? order.logs.find(log => log.decision === 'REJECTED') : undefined;

  return (
    <div className="flex flex-col gap-8">
      <Link href="/orders" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> All orders
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps text-muted">Cutting order</p>
          <h1 className="tabular mt-1 font-display text-5xl leading-none text-ink sm:text-6xl">{order.orderNo}</h1>
        </div>
        <StatusBadge status={order.status} className="text-sm" />
      </header>

      <Panel className="p-5 sm:p-6">
        <OrderFacts order={order} />
      </Panel>

      {rejection && (
        <Panel className="border-shortage-line p-5 sm:p-6" aria-labelledby="rejection-heading">
          <div className="flex items-start gap-3">
            <MessageSquareWarning aria-hidden className="mt-1 size-5 shrink-0 text-shortage" />
            <div className="min-w-0 flex-1">
              <h2 id="rejection-heading" className="font-display text-3xl text-ink">
                Returned for re-cutting
              </h2>
              <p className="mt-1 text-sm text-muted">
                {rejection.verifierName} · {formatDateTime(rejection.createdAt)}
              </p>
              <blockquote className="mt-3 rounded-[12px] border-l-4 border-shortage bg-shortage-tint px-4 py-3 text-ink">
                {rejection.rejectionNote}
              </blockquote>
              <h3 className="label-caps mt-6 text-ink">Counts that failed</h3>
              <div className="mt-2">
                <CountsTable rows={rejection.items} caption="Counts recorded when the batch was rejected" />
              </div>
            </div>
          </div>
        </Panel>
      )}

      {(order.status === 'CUTTING_IN_PROGRESS' || order.status === 'REJECTED') && (
        <Panel className="p-5 sm:p-6" aria-labelledby="submit-heading">
          <h2 id="submit-heading" className="flex items-center gap-2 font-display text-3xl text-ink">
            <Scissors aria-hidden className="size-5" />
            {order.status === 'REJECTED' ? 'Re-cut and resubmit' : 'Finish cutting'}
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted">
            {order.status === 'REJECTED'
              ? 'Once the short pieces are re-cut, log the total fabric now used. The verifier will count the whole batch again from zero.'
              : 'Log the fabric used, then send the bundles to the QC table.'}
          </p>
          <SubmitForm order={order} />
        </Panel>
      )}

      {order.status === 'PENDING_VERIFICATION' && (
        <p className="flex items-center gap-2 rounded-[12px] bg-aqua px-4 py-3 text-sm text-ink">
          <Clock3 aria-hidden className="size-4" /> Waiting at the QC table since {formatDateTime(order.submittedAt)}. Only a cutting verifier can count and sign it off.
        </p>
      )}

      {order.status !== 'CUTTING_IN_PROGRESS' && order.status !== 'REJECTED' && (
        <Panel className="p-5 sm:p-6" aria-labelledby="components-heading">
          <h2 id="components-heading" className="font-display text-3xl text-ink">
            Components
          </h2>
          <div className="mt-4">
            <CountsTable rows={order.items} caption="Component counts for this order" />
          </div>
        </Panel>
      )}

      <Panel className="p-5 sm:p-6">
        <AuditTimeline order={order} />
      </Panel>
    </div>
  );
}
