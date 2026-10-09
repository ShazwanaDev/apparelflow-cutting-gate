import type { Metadata } from 'next';
import { ClipboardCheck } from 'lucide-react';
import { OrderList } from '@/components/orders/order-list';
import { StageHeader } from '@/components/shell/pipeline';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { EmptyState } from '@/components/ui/states';
import type { OrderStatus } from '@/lib/domain/constants';
import { listOrders } from '@/lib/domain/orders';
import { getDb } from '@/lib/server/db';
import { loadForPage, requirePageActor } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Verification queue' };

const TABS: Array<{ status: OrderStatus; label: string }> = [
  { status: 'PENDING_VERIFICATION', label: 'Awaiting count' },
  { status: 'REJECTED', label: 'Rejected' },
  { status: 'VERIFIED', label: 'Verified' },
];

export default async function VerifyQueuePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requirePageActor('order:approve');
  const { status: requested } = await searchParams;
  const status = TABS.find(tab => tab.status === requested)?.status ?? 'PENDING_VERIFICATION';
  const { orders, counts } = await loadForPage(listOrders(getDb(), actor, { status }));
  const pending = status === 'PENDING_VERIFICATION';

  return (
    <div className="flex flex-col gap-8">
      <StageHeader stage="Verification">
        <p className="max-w-xs text-sm text-muted">
          Oldest bundles first. Nothing reaches sewing until every component is counted with no shortage.
        </p>
      </StageHeader>

      <SegmentedTabs
        id="verify"
        label="Filter batches"
        tabs={TABS.map(tab => ({
          href: tab.status === 'PENDING_VERIFICATION' ? '/verify' : `/verify?status=${tab.status}`,
          label: tab.label,
          count: counts[tab.status] ?? 0,
          active: tab.status === status,
        }))}
      />

      {orders.length > 0 ? (
        <OrderList orders={orders} hrefFor={order => `/verify/${order.id}`} emphasiseWaiting={pending} />
      ) : (
        <EmptyState icon={<ClipboardCheck aria-hidden className="size-5" />} title={pending ? 'The QC table is clear' : 'Nothing here'}>
          {pending ? 'No bundles are waiting to be counted. New batches appear here as soon as a cutting supervisor sends them.' : 'No batches in this list yet.'}
        </EmptyState>
      )}
    </div>
  );
}
