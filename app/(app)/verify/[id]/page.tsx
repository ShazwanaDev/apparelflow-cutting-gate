import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, StickyNote } from 'lucide-react';
import { AuditTimeline } from '@/components/audit/timeline';
import { CountsTable } from '@/components/orders/counts-table';
import { OrderFacts } from '@/components/orders/order-facts';
import { StageHeader } from '@/components/shell/pipeline';
import { StatusBadge } from '@/components/ui/status';
import { Panel } from '@/components/ui/states';
import { VerificationTerminal } from '@/components/verify/terminal';
import { getOrder } from '@/lib/domain/orders';
import { formatCount, timeAgo } from '@/lib/format';
import { getDb } from '@/lib/server/db';
import { loadForPage, requirePageActor } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Verification terminal' };

export default async function VerifyOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor('order:approve');
  const { id } = await params;
  if (!/^[1-9]\d{0,8}$/.test(id)) notFound();
  const order = await loadForPage(getOrder(getDb(), actor, Number(id)));
  const pending = order.status === 'PENDING_VERIFICATION';
  const resubmission = [...order.events].reverse().find(event => event.eventType === 'RESUBMITTED' || event.eventType === 'SUBMITTED');

  return (
    <div className="flex flex-col gap-8">
      <Link href="/verify" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Verification queue
      </Link>

      <StageHeader stage="Verification" title={pending ? 'Verification' : order.orderNo}>
        <div className="md:text-right">
          <p className="tabular font-mono text-2xl font-semibold text-ink">{order.orderNo}</p>
          <p className="text-sm text-muted">
            {order.recipeName} · {formatCount(order.targetQty)} garments{pending ? ` · waiting ${timeAgo(order.submittedAt)}` : ''}
          </p>
          <StatusBadge status={order.status} className="mt-2" />
        </div>
      </StageHeader>

      {pending && resubmission?.note && (
        <p className="flex gap-2 rounded-[12px] bg-aqua px-4 py-3 text-sm text-ink">
          <StickyNote aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">Note from {resubmission.actorName}: </span>
            {resubmission.note}
          </span>
        </p>
      )}

      {pending ? (
        <VerificationTerminal order={order} />
      ) : (
        <>
          <Panel className="p-5 sm:p-6">
            <OrderFacts order={order} />
          </Panel>
          <Panel className="p-5 sm:p-6" aria-labelledby="counts-heading">
            <h2 id="counts-heading" className="font-display text-3xl text-ink">
              Counts
            </h2>
            <p className="mt-1 text-sm text-muted">This batch is no longer waiting for verification, so its counts are read-only.</p>
            <div className="mt-4">
              <CountsTable rows={order.items} caption="Component counts" />
            </div>
          </Panel>
        </>
      )}

      <Panel className="p-5 sm:p-6">
        <AuditTimeline order={order} />
      </Panel>
    </div>
  );
}
