import { TriangleAlert } from 'lucide-react';
import { Fact } from '@/components/ui/states';
import type { OrderDetail } from '@/lib/domain/orders';
import { formatCount, formatPercent, formatYards } from '@/lib/format';

/** Key numbers for a batch: recipe, quantity, roll, fabric and wastage against the cap. */
export function OrderFacts({ order }: { order: OrderDetail }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
      <Fact label="Recipe">
        {order.recipeName}
        <span className="block font-mono text-xs text-muted">{order.recipeCode}</span>
      </Fact>
      <Fact label="Batch">
        <span className="tabular font-mono">{formatCount(order.targetQty)}</span> garments
      </Fact>
      <Fact label="Fabric roll">
        <span className="font-mono break-all">{order.fabricRollId}</span>
      </Fact>
      <Fact label="Expected fabric">
        <span className="tabular font-mono">{formatYards(order.expectedFabricYds)}</span>
        <span className="block text-xs text-muted">{order.stdFabricYards} yd per garment</span>
      </Fact>
      <Fact label="Actual fabric">
        <span className="tabular font-mono">{formatYards(order.actualFabricYds)}</span>
      </Fact>
      <Fact label="Wastage">
        <span className="tabular font-mono">{formatPercent(order.wastagePct)}</span>
        <span className="block text-xs text-muted">Cap {order.wastageCap}%</span>
        {order.overWastageCap && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-excess-tint px-2 py-0.5 text-xs font-semibold text-excess">
            <TriangleAlert aria-hidden className="size-3" /> Over cap
          </span>
        )}
      </Fact>
    </dl>
  );
}
