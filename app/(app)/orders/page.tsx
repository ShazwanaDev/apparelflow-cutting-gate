import type { Metadata } from 'next';
import { Inbox } from 'lucide-react';
import { CreateOrderSheet } from '@/components/orders/create-order-sheet';
import { OrderList } from '@/components/orders/order-list';
import { SearchBox } from '@/components/orders/search-box';
import { StageHeader } from '@/components/shell/pipeline';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { EmptyState } from '@/components/ui/states';
import { ORDER_STATUSES, STATUS_LABELS, type OrderStatus } from '@/lib/domain/constants';
import { listOrders, listRecipes } from '@/lib/domain/orders';
import { getDb } from '@/lib/server/db';
import { loadForPage, requirePageActor } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Cutting orders' };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const actor = await requirePageActor('order:create');
  const params = await searchParams;
  const status = (ORDER_STATUSES as readonly string[]).includes(params.status ?? '') ? (params.status as OrderStatus) : undefined;
  const q = params.q?.slice(0, 60);
  const [{ orders, counts }, recipes] = await Promise.all([
    loadForPage(listOrders(getDb(), actor, { status, q })),
    loadForPage(listRecipes(getDb(), actor)),
  ]);

  const total = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);
  const href = (next?: OrderStatus) => {
    const query = new URLSearchParams();
    if (next) query.set('status', next);
    if (q) query.set('q', q);
    const text = query.toString();
    return text ? `/orders?${text}` : '/orders';
  };

  return (
    <div className="flex flex-col gap-8">
      <StageHeader stage="Cutting">
        <CreateOrderSheet recipes={recipes} />
      </StageHeader>

      {(counts.REJECTED ?? 0) > 0 && status !== 'REJECTED' && (
        <a
          href={href('REJECTED')}
          className="flex items-center justify-between gap-3 rounded-[12px] border border-shortage-line bg-shortage-tint px-4 py-3 text-sm text-ink hover:border-shortage"
        >
          <span>
            <span className="font-semibold text-shortage">
              {counts.REJECTED} {counts.REJECTED === 1 ? 'batch was' : 'batches were'} rejected at QC
            </span>{' '}
            and {counts.REJECTED === 1 ? 'needs' : 'need'} re-cutting.
          </span>
          <span className="font-medium underline underline-offset-4">Review</span>
        </a>
      )}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <SegmentedTabs
          id="orders"
          label="Filter orders by status"
          tabs={[
            { href: href(), label: 'All', count: total, active: !status },
            ...ORDER_STATUSES.map(value => ({ href: href(value), label: STATUS_LABELS[value], count: counts[value] ?? 0, active: status === value })),
          ]}
        />
        <SearchBox placeholder="Order no. or fabric roll" />
      </div>

      {orders.length > 0 ? (
        <OrderList orders={orders} hrefFor={order => `/orders/${order.id}`} />
      ) : (
        <EmptyState icon={<Inbox aria-hidden className="size-5" />} title={q ? 'No matching orders' : 'Nothing here yet'}>
          {q
            ? `No order number or fabric roll contains “${q}”${status ? ` in ${STATUS_LABELS[status].toLowerCase()}` : ''}.`
            : status
              ? `No orders are ${STATUS_LABELS[status].toLowerCase()} right now.`
              : 'Create the first cutting order from a recipe to get started.'}
        </EmptyState>
      )}
    </div>
  );
}
