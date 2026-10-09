import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BadgeCheck, Shirt } from 'lucide-react';
import { AuditTimeline } from '@/components/audit/timeline';
import { CountsTable } from '@/components/orders/counts-table';
import { OrderFacts } from '@/components/orders/order-facts';
import { StartSewingButton } from '@/components/sewing/start-sewing-button';
import { StatusBadge } from '@/components/ui/status';
import { Panel } from '@/components/ui/states';
import { getSewingBatch } from '@/lib/domain/orders';
import { formatDateTime, formatPercent } from '@/lib/format';
import { getDb } from '@/lib/server/db';
import { loadForPage, requirePageActor } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Verified batch' };

export default async function SewingBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor('sewing:read');
  const { id } = await params;
  if (!/^[1-9]\d{0,8}$/.test(id)) notFound();
  // Unverified orders are filtered out inside the query, so they 404 here.
  const order = await loadForPage(getSewingBatch(getDb(), actor, Number(id)));
  const approval = order.logs.find(log => log.decision === 'APPROVED')!;

  return (
    <div className="flex flex-col gap-8">
      <Link href="/sewing" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Sewing queue
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps text-muted">Verified batch</p>
          <h1 className="tabular mt-1 font-display text-5xl leading-none text-ink sm:text-6xl">{order.orderNo}</h1>
        </div>
        <StatusBadge status={order.status} className="text-sm" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel className="p-5 sm:p-6">
            <OrderFacts order={order} />
          </Panel>
          <Panel className="p-5 sm:p-6" aria-labelledby="pieces-heading">
            <h2 id="pieces-heading" className="font-display text-3xl text-ink">
              Piece counts
            </h2>
            <p className="mt-1 text-sm text-muted">As signed off by the verifier. Surplus pieces are marked so they can be returned or kept as spares.</p>
            <div className="mt-4">
              <CountsTable rows={approval.items} caption="Verified piece counts" />
            </div>
          </Panel>
        </div>

        <aside aria-label="Sign-off and actions" className="order-first flex flex-col gap-4 lg:order-none">
          <Panel className="bg-match-tint p-5" aria-labelledby="signoff-heading">
            <h2 id="signoff-heading" className="flex items-center gap-2 font-display text-3xl text-ink">
              <BadgeCheck aria-hidden className="size-6 text-match" /> Signed off
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="label-caps text-muted">Verifier</dt>
                <dd className="mt-0.5 text-base font-semibold text-ink">{approval.verifierName}</dd>
              </div>
              <div>
                <dt className="label-caps text-muted">Server time</dt>
                <dd className="tabular mt-0.5 text-ink">
                  <time dateTime={approval.createdAt}>{formatDateTime(approval.createdAt)}</time>
                </dd>
              </div>
              <div>
                <dt className="label-caps text-muted">Recorded wastage</dt>
                <dd className="tabular mt-0.5 font-mono text-ink">
                  {formatPercent(approval.wastagePct)} <span className="font-sans text-muted">(cap {order.wastageCap}%)</span>
                </dd>
              </div>
            </dl>
          </Panel>
          <Panel className="p-5">
            {order.status === 'VERIFIED' ? (
              <>
                <p className="mb-4 text-sm text-muted">Starting assembly moves this batch to the sewing line. It is recorded under your name.</p>
                <StartSewingButton orderId={order.id} orderNo={order.orderNo} />
              </>
            ) : (
              <p className="flex items-start gap-2 text-sm text-ink">
                <Shirt aria-hidden className="mt-0.5 size-4 shrink-0" /> On the sewing line since {formatDateTime(order.sewingStartedAt)}.
              </p>
            )}
          </Panel>
        </aside>
      </div>

      <Panel className="p-5 sm:p-6">
        <AuditTimeline order={order} />
      </Panel>
    </div>
  );
}
