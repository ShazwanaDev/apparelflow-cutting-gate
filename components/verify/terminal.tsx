'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { Check, CircleCheck, CircleDashed, CircleX, CloudCheck, Loader2, Lock, TriangleAlert, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FlagChip, FlagDot } from '@/components/ui/status';
import { api } from '@/lib/client/api';
import { LIMITS, type CountFlag } from '@/lib/domain/constants';
import type { OrderDetail } from '@/lib/domain/orders';
import { flagFor, isOverWastageCap, summarizeCounts, varianceOf } from '@/lib/domain/rules';
import { formatCount, formatPercent, formatYards } from '@/lib/format';
import { parseWholeNumberInput, rejectReason } from '@/lib/validation';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * The verification terminal. The verifier types a count for each component and
 * sees its traffic light immediately. Everything shown here is a preview: the
 * same rules run again on the server against the stored counts when Approve is
 * pressed, and the server's answer is the one that counts.
 */
export function VerificationTerminal({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [texts, setTexts] = useState<Record<number, string>>(() =>
    Object.fromEntries(order.items.map(item => [item.componentId, item.actualQty == null ? '' : String(item.actualQty)])),
  );
  const [focused, setFocused] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [serverBlock, setServerBlock] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});
  const approveRef = useRef<HTMLButtonElement>(null);
  const lastSaved = useRef(JSON.stringify(texts));

  const rows = useMemo(
    () =>
      order.items.map(item => {
        const parsed = parseWholeNumberInput(texts[item.componentId] ?? '');
        const flag: CountFlag = parsed.error ? 'UNCOUNTED' : flagFor(parsed.value, item.expectedQty);
        return { ...item, parsed, flag, variance: parsed.error ? null : varianceOf(parsed.value, item.expectedQty) };
      }),
    [order.items, texts],
  );
  const invalidCount = rows.filter(row => row.parsed.error).length;
  const summary = summarizeCounts(rows.map(row => ({ name: row.componentName, expected: row.expectedQty, actual: row.parsed.error ? null : row.parsed.value })));
  const blockReason = invalidCount > 0 ? `${invalidCount} count${invalidCount === 1 ? ' is' : 's are'} not a valid whole number` : summary.blockReason;
  const canApprove = invalidCount === 0 && summary.canApprove;

  const validCounts = useCallback(
    () =>
      rows
        .filter(row => !row.parsed.error && row.parsed.value != null)
        .map(row => ({ component_id: row.componentId, actual_qty: row.parsed.value as number })),
    [rows],
  );

  // Counts are saved shortly after the verifier stops typing, so a reload, a
  // dropped connection or a tablet going to sleep loses nothing.
  useEffect(() => {
    const snapshot = JSON.stringify(texts);
    if (snapshot === lastSaved.current || approved) return;
    const counts = validCounts();
    if (counts.length === 0) return;
    const timer = window.setTimeout(async () => {
      setSaveState('saving');
      const result = await api(`/api/orders/${order.id}/counts`, { method: 'PUT', body: { counts } });
      if (result.ok) {
        lastSaved.current = snapshot;
        setSaveState('saved');
      } else {
        setSaveState('error');
        if (result.error.status === 409) {
          toast.error('This batch was already decided', { description: result.error.message });
          router.refresh();
        }
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [texts, validCounts, order.id, router, approved]);

  function focusRow(index: number) {
    const next = rows[index];
    if (next) inputs.current[next.componentId]?.focus();
    else approveRef.current?.focus();
  }

  async function approve() {
    setApproving(true);
    setServerBlock(null);
    const result = await api<{ order: OrderDetail }>(`/api/orders/${order.id}/approve`, { method: 'POST', body: { counts: validCounts() } });
    setApproving(false);
    if (!result.ok) {
      setServerBlock(result.error.message);
      toast.error(result.error.status === 422 ? 'Approval blocked by the server' : 'Could not approve', { description: result.error.message });
      if (result.error.status === 409) router.refresh();
      return;
    }
    setApproved(true);
    toast.success(`${order.orderNo} verified`, {
      description: `Released to the sewing queue. Wastage ${formatPercent(result.data.order.logs[0]?.wastagePct)} recorded.`,
    });
    window.setTimeout(() => {
      router.push('/verify');
      router.refresh();
    }, reduce ? 300 : 900);
  }

  const wastage = order.wastagePct;
  const overCap = wastage != null && isOverWastageCap(wastage, order.wastageCap);

  const decision = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 rounded-[12px] bg-sunken p-4">
        <div>
          <p className="label-caps text-muted">Fabric wastage</p>
          <p className={`tabular mt-1 font-mono text-2xl ${overCap ? 'text-excess' : 'text-ink'}`}>{formatPercent(wastage)}</p>
        </div>
        <div>
          <p className="label-caps text-muted">Recipe cap</p>
          <p className="tabular mt-1 font-mono text-2xl text-ink">{order.wastageCap.toFixed(2)}%</p>
        </div>
        <p className="col-span-2 text-xs text-muted">
          {formatYards(order.actualFabricYds)} used against {formatYards(order.expectedFabricYds)} expected.
          {overCap && (
            <span className="mt-1 flex items-center gap-1 font-semibold text-excess">
              <TriangleAlert aria-hidden className="size-3.5" /> Over cap: recorded as a warning, does not block approval.
            </span>
          )}
        </p>
      </div>

      <div aria-live="polite" className="min-h-6">
        {!canApprove && !approved && (
          <p className="flex gap-2 rounded-[8px] border border-shortage-line bg-shortage-tint px-3 py-2 text-sm text-ink">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-shortage" />
            <span>
              <span className="font-semibold text-shortage">Approval locked. </span>
              {blockReason}.
            </span>
          </p>
        )}
        {serverBlock && canApprove && (
          <p role="alert" className="rounded-[8px] border border-shortage-line bg-shortage-tint px-3 py-2 text-sm text-shortage">
            {serverBlock}
          </p>
        )}
        {canApprove && !serverBlock && !approved && (
          <p className="flex items-center gap-2 text-sm text-match">
            <CircleCheck aria-hidden className="size-4" /> Every component counted, no shortages.
          </p>
        )}
      </div>

      <motion.div layout={!reduce}>
        <Button
          ref={approveRef}
          size="lg"
          className="w-full"
          disabled={!canApprove || approved}
          loading={approving}
          aria-describedby="approve-help"
          onClick={approve}
          icon={approved ? <Check aria-hidden className="size-5" /> : undefined}
        >
          {approved ? 'Verified' : 'Approve batch'}
        </Button>
      </motion.div>
      <p id="approve-help" className="sr-only">
        {canApprove ? 'All components match or have surplus.' : blockReason}
      </p>
      <Button variant="danger" className="w-full" disabled={approved} onClick={() => setRejectOpen(true)} icon={<Undo2 aria-hidden className="size-4" />}>
        Reject batch
      </Button>
      <SaveIndicator state={saveState} />
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)_300px] xl:grid-cols-[220px_minmax(0,1fr)_340px]">
      {/* Component index: where each count stands, at a glance. */}
      <nav aria-label="Components" className="hidden lg:block">
        <div className="sticky top-36">
          <p className="label-caps mb-3 text-muted">Components</p>
          <ol className="flex flex-col">
            {rows.map((row, index) => (
              <li key={row.componentId}>
                <button
                  type="button"
                  onClick={() => focusRow(index)}
                  className="relative flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-[8px] py-2 pr-2 pl-4 text-left text-sm text-ink hover:bg-blush-tint"
                >
                  {focused === row.componentId && (
                    <motion.span layoutId="index-marker" aria-hidden className="absolute top-2 bottom-2 left-0 w-1 rounded-full bg-coral" transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }} />
                  )}
                  <FlagDot flag={row.flag} />
                  <span className="min-w-0 flex-1 truncate" title={row.componentName}>
                    {row.componentName}
                  </span>
                  <span className="sr-only">: {row.flag === 'UNCOUNTED' ? 'not counted' : row.flag === 'GREEN' ? 'match' : row.flag === 'YELLOW' ? 'excess' : 'shortage'}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      {/* Counting table */}
      <section aria-labelledby="count-heading" className="min-w-0 rounded-[20px] border border-line bg-surface shadow-[var(--shadow-raised)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-4 sm:px-6">
          <h2 id="count-heading" className="font-display text-3xl text-ink">
            Count the bundles
          </h2>
          <p className="text-sm text-muted">Type each count. Enter moves to the next component.</p>
        </div>

        <div role="table" aria-label="Component counts" className="text-sm">
          <div role="rowgroup" className="hidden sm:block">
            <div role="row" className="grid grid-cols-[minmax(0,1.4fr)_88px_132px_minmax(150px,1fr)] items-center gap-3 border-b border-line px-6 py-2">
              <span role="columnheader" className="label-caps text-muted">Component</span>
              <span role="columnheader" className="label-caps text-right text-muted">Expected</span>
              <span role="columnheader" className="label-caps text-muted">Counted</span>
              <span role="columnheader" className="label-caps text-right text-muted">Status</span>
            </div>
          </div>
          <div role="rowgroup">
            {rows.map((row, index) => {
              const inputId = `count-${row.componentId}`;
              const errorId = `${inputId}-error`;
              return (
                <div
                  role="row"
                  key={row.componentId}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-line px-4 py-4 transition-colors last:border-0 sm:grid-cols-[minmax(0,1.4fr)_88px_132px_minmax(150px,1fr)] sm:px-6 sm:py-3 ${
                    focused === row.componentId ? 'bg-blush-tint/60' : ''
                  }`}
                >
                  <div role="rowheader" className="min-w-0">
                    <label htmlFor={inputId} className="block font-medium text-ink">
                      {row.componentName}
                    </label>
                    <span className="text-xs text-muted">
                      {row.piecesPerGarment} per garment × {formatCount(order.targetQty)}
                    </span>
                  </div>
                  <div role="cell" className="tabular text-right font-mono text-base text-ink sm:text-sm">
                    <span className="label-caps mr-2 font-sans text-muted sm:hidden">Expected</span>
                    {formatCount(row.expectedQty)}
                  </div>
                  <div role="cell" className="col-span-2 sm:col-span-1">
                    <input
                      id={inputId}
                      ref={element => {
                        inputs.current[row.componentId] = element;
                      }}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      enterKeyHint={index === rows.length - 1 ? 'done' : 'next'}
                      autoComplete="off"
                      placeholder="—"
                      maxLength={9}
                      value={texts[row.componentId] ?? ''}
                      disabled={approved}
                      aria-invalid={Boolean(row.parsed.error)}
                      aria-describedby={row.parsed.error ? errorId : `${inputId}-status`}
                      onFocus={event => {
                        setFocused(row.componentId);
                        event.currentTarget.select();
                      }}
                      onBlur={() => setFocused(current => (current === row.componentId ? null : current))}
                      onChange={event => {
                        setServerBlock(null);
                        setTexts(current => ({ ...current, [row.componentId]: event.target.value }));
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          focusRow(index + 1);
                        }
                      }}
                      className="field-control tabular min-h-12 text-right font-mono text-lg sm:min-h-11 sm:text-base"
                    />
                    {row.parsed.error && (
                      <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-shortage">
                        {row.parsed.error}
                      </p>
                    )}
                  </div>
                  <div role="cell" id={`${inputId}-status`} className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                    <FlagChip flag={row.flag} variance={row.variance} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <SummaryBar summary={summary} />
      </section>

      {/* Decision panel: beside the table on wide screens, under it on tablets and phones. */}
      <aside aria-labelledby="decision-heading" className="lg:block">
        <div className="rounded-[20px] border border-line bg-surface p-5 shadow-[var(--shadow-raised)] lg:sticky lg:top-36">
          <h2 id="decision-heading" className="font-display text-3xl text-ink">
            Decision
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted">Signed as you. The server records the time.</p>
          {decision}
        </div>
      </aside>

      {/* Phones: the decision stays within thumb reach while counting. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <div className="flex items-center gap-3">
          <p className="tabular min-w-0 flex-1 font-mono text-xs text-ink">
            <span className="text-match">✓{summary.match}</span> · <span className="text-excess">▲{summary.excess}</span> ·{' '}
            <span className="text-shortage">✕{summary.shortage}</span> · <span className="text-muted">○{summary.uncounted}</span>
          </p>
          <Button size="md" disabled={!canApprove || approved} loading={approving} onClick={approve}>
            {approved ? 'Verified' : 'Approve'}
          </Button>
        </div>
      </div>

      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} order={order} counts={validCounts} />
    </div>
  );
}

function SummaryBar({ summary }: { summary: ReturnType<typeof summarizeCounts> }) {
  const items = [
    { key: 'match', label: 'match', value: summary.match, Icon: CircleCheck, tone: 'text-match' },
    { key: 'excess', label: 'excess', value: summary.excess, Icon: TriangleAlert, tone: 'text-excess' },
    { key: 'shortage', label: 'shortage', value: summary.shortage, Icon: CircleX, tone: 'text-shortage' },
    { key: 'uncounted', label: 'uncounted', value: summary.uncounted, Icon: CircleDashed, tone: 'text-muted' },
  ];
  return (
    <div className="sticky bottom-0 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-b-[20px] border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:px-6" aria-live="polite" aria-atomic="true">
      {items.map(item => (
        <span key={item.key} className={`inline-flex items-center gap-1.5 text-sm ${item.tone}`}>
          <item.Icon aria-hidden className="size-4" />
          <Ticker value={item.value} />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

/** A count that rolls to its new value instead of jumping. */
function Ticker({ value }: { value: number }) {
  const reduce = useReducedMotion();
  return (
    <span className="tabular relative inline-flex h-5 min-w-[1ch] overflow-hidden font-mono font-semibold">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduce ? false : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? undefined : { y: '-100%', opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const content: Record<SaveState, React.ReactNode> = {
    idle: <>Counts save automatically as you type.</>,
    saving: (
      <>
        <Loader2 aria-hidden className="size-3.5 animate-spin" /> Saving counts…
      </>
    ),
    saved: (
      <>
        <CloudCheck aria-hidden className="size-3.5" /> Counts saved. Safe to reload.
      </>
    ),
    error: <span className="text-shortage">Counts not saved. They will be sent again with your decision.</span>,
  };
  return (
    <p role="status" className="flex items-center gap-1.5 text-xs text-muted">
      {content[state]}
    </p>
  );
}

function RejectDialog({
  open,
  onOpenChange,
  order,
  counts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderDetail;
  counts: () => Array<{ component_id: number; actual_qty: number }>;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = reason.trim().length;
  const remaining = LIMITS.minRejectReason - trimmed;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const check = rejectReason.safeParse(reason);
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? 'Enter a reason');
      document.getElementById('reject-reason')?.focus();
      return;
    }
    setBusy(true);
    const result = await api(`/api/orders/${order.id}/reject`, { method: 'POST', body: { reason, counts: counts() } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.success(`${order.orderNo} rejected`, { description: 'Returned to the cutting supervisor with your reason.' });
    onOpenChange(false);
    router.push('/verify');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Reject batch" description={`${order.orderNo} goes back to the cutting supervisor for re-cutting.`}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reject-reason" className="text-sm font-medium text-ink">
            Reason<span aria-hidden className="ml-0.5 text-shortage">*</span>
          </label>
          <textarea
            id="reject-reason"
            rows={4}
            maxLength={LIMITS.maxRejectReason}
            value={reason}
            required
            aria-invalid={Boolean(error)}
            aria-describedby="reject-hint"
            placeholder="e.g. Sleeve cuffs are 4 short; collar bundle has 2 mis-cut pieces."
            onChange={event => {
              setReason(event.target.value);
              setError(null);
            }}
            className="field-control resize-y"
          />
          <p id="reject-hint" className={`flex justify-between gap-3 text-sm ${error ? 'font-medium text-shortage' : 'text-muted'}`} role={error ? 'alert' : undefined}>
            <span>{error ?? (remaining > 0 ? `At least ${remaining} more character${remaining === 1 ? '' : 's'} needed.` : 'The supervisor sees this word for word.')}</span>
            <span className="tabular shrink-0 font-mono">
              {reason.length}/{LIMITS.maxRejectReason}
            </span>
          </p>
        </div>
        <p className="text-sm text-muted">The counts you have entered are saved with the rejection so the supervisor can see what failed.</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Keep counting
          </Button>
          <Button type="submit" variant="danger" loading={busy}>
            Reject and return
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
