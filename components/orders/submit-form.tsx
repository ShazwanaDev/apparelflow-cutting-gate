'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { api } from '@/lib/client/api';
import type { OrderDetail } from '@/lib/domain/orders';
import { isOverWastageCap, wastagePct } from '@/lib/domain/rules';
import { formatPercent } from '@/lib/format';
import { fabricRollId, parseYardsInput } from '@/lib/validation';

/**
 * Sends a batch to the QC table. For a fresh batch this logs the fabric used;
 * for a rejected one it records the re-cut (new yardage, optionally a new roll)
 * and starts a fresh count.
 */
export function SubmitForm({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const resubmit = order.status === 'REJECTED';
  const [yardsText, setYardsText] = useState(order.actualFabricYds != null ? String(order.actualFabricYds) : '');
  const [roll, setRoll] = useState(order.fabricRollId);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ yards?: string; roll?: string; note?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const yards = parseYardsInput(yardsText);
  const projected = yards.value ? wastagePct(yards.value, order.stdFabricYards, order.targetQty) : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (yards.error || yards.value == null) next.yards = yards.error ?? 'Enter the fabric used';
    const rollResult = fabricRollId.safeParse(roll);
    if (!rollResult.success) next.roll = rollResult.error.issues[0]?.message;
    if (note.length > 500) next.note = 'Keep the note under 500 characters';
    setErrors(next);
    if (Object.keys(next).length) {
      document.getElementById(next.yards ? 'submit-yards' : next.roll ? 'submit-roll' : 'submit-note')?.focus();
      return;
    }
    setBusy(true);
    const result = await api<{ order: OrderDetail }>(`/api/orders/${order.id}/submit`, {
      method: 'POST',
      body: {
        actual_fabric_yds: yards.value,
        ...(roll !== order.fabricRollId ? { fabric_roll_id: roll } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
    });
    setBusy(false);
    if (!result.ok) {
      setErrors({ form: result.error.message });
      return;
    }
    toast.success(resubmit ? 'Re-cut batch resubmitted' : 'Sent for verification', {
      description: `${order.orderNo} is now in the verification queue.`,
    });
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="submit-yards"
          label={resubmit ? 'Total fabric used incl. re-cut (yd)' : 'Actual fabric used (yd)'}
          error={errors.yards ?? (yardsText ? yards.error : undefined)}
          hint={projected != null ? `Projected wastage ${formatPercent(projected)} against a ${order.wastageCap}% cap` : undefined}
          required
        >
          {props => (
            <input
              {...props}
              inputMode="decimal"
              autoComplete="off"
              value={yardsText}
              onChange={event => setYardsText(event.target.value)}
              className="field-control tabular font-mono"
            />
          )}
        </Field>
        <Field id="submit-roll" label="Fabric roll ID" error={errors.roll} required>
          {props => (
            <input
              {...props}
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              value={roll}
              onChange={event => setRoll(event.target.value.toUpperCase())}
              className="field-control font-mono uppercase"
            />
          )}
        </Field>
      </div>
      {projected != null && isOverWastageCap(projected, order.wastageCap) && (
        <p className="rounded-[8px] bg-excess-tint px-3 py-2 text-sm text-excess">
          Wastage is above the recipe cap. The batch can still be verified; the overage is recorded with it.
        </p>
      )}
      <Field id="submit-note" label="Note for the verifier" hint={resubmit ? 'What was re-cut, for the audit trail' : 'Optional'} error={errors.note}>
        {props => (
          <textarea
            {...props}
            rows={2}
            maxLength={500}
            value={note}
            onChange={event => setNote(event.target.value)}
            className="field-control resize-y"
          />
        )}
      </Field>
      {errors.form && (
        <p role="alert" className="rounded-[8px] border border-shortage-line bg-shortage-tint px-3 py-2 text-sm font-medium text-shortage">
          {errors.form}
        </p>
      )}
      <div>
        <Button type="submit" loading={busy} icon={<Send aria-hidden className="size-4" />}>
          {resubmit ? 'Resubmit for verification' : 'Send for verification'}
        </Button>
      </div>
    </form>
  );
}
