import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Shirt, ShieldCheck, TriangleAlert } from 'lucide-react';
import { StageHeader } from '@/components/shell/pipeline';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/states';
import { sewingQueue } from '@/lib/domain/orders';
import { formatCount, formatDateTime, formatPercent } from '@/lib/format';
import { getDb } from '@/lib/server/db';
import { loadForPage, requirePageActor } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Sewing queue' };

export default async function SewingQueuePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requirePageActor('sewing:read');
  const tab = (await searchParams).tab === 'in_sewing' ? 'in_sewing' : 'ready';
  const [ready, inSewing] = await Promise.all([
    loadForPage(sewingQueue(getDb(), actor, 'ready')),
    loadForPage(sewingQueue(getDb(), actor, 'in_sewing')),
  ]);
  const orders = tab === 'ready' ? ready : inSewing;

  return (
    <div className="flex flex-col gap-8">
      <StageHeader stage="Sewing">
        <p className="flex max-w-xs items-start gap-2 text-sm text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-match" />
          Only batches a cutting verifier has counted and signed off appear here.
        </p>
      </StageHeader>

      <SegmentedTabs
        id="sewing"
        label="Sewing queue"
        tabs={[
          { href: '/sewing', label: 'Ready for sewing', count: ready.length, active: tab === 'ready' },
          { href: '/sewing?tab=in_sewing', label: 'In sewing', count: inSewing.length, active: tab === 'in_sewing' },
        ]}
      />

      {orders.length === 0 ? (
        <EmptyState icon={<Shirt aria-hidden className="size-5" />} title={tab === 'ready' ? 'No verified batches yet' : 'Nothing on the line'}>
          {tab === 'ready'
            ? 'Batches arrive here the moment a verifier approves them. Until then there is nothing for the sewing floor to pick up.'
            : 'Start sewing on a verified batch and it moves here.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orders.map(order => (
            <li key={order.id}>
              <Link
                href={`/sewing/${order.id}`}
                className="group flex h-full flex-col gap-4 rounded-[20px] border border-line bg-surface p-5 shadow-[var(--shadow-raised)] transition-colors hover:border-ink"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="tabular font-mono text-lg font-semibold text-ink">{order.orderNo}</p>
                    <p className="text-sm text-muted">
                      {order.recipeName} · {formatCount(order.targetQty)} garments
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="label-caps text-muted">Verified by</dt>
                    <dd className="mt-0.5 text-ink">{order.verifierName}</dd>
                  </div>
                  <div>
                    <dt className="label-caps text-muted">Signed off</dt>
                    <dd className="tabular mt-0.5 text-ink">{formatDateTime(order.verifiedAt)}</dd>
                  </div>
                  <div>
                    <dt className="label-caps text-muted">Wastage</dt>
                    <dd className="tabular mt-0.5 flex items-center gap-1 font-mono text-ink">
                      {formatPercent(order.wastagePct)}
                      {order.overWastageCap && <TriangleAlert aria-label="over the recipe cap" className="size-3.5 text-excess" />}
                    </dd>
                  </div>
                  <div>
                    <dt className="label-caps text-muted">Surplus</dt>
                    <dd className="mt-0.5 text-ink">{order.excessComponents ? `${order.excessComponents} component${order.excessComponents === 1 ? '' : 's'}` : 'None'}</dd>
                  </div>
                </dl>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-ink">
                  Inspect batch <ChevronRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
