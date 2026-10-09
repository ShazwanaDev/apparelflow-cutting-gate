'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { api } from '@/lib/client/api';
import { LIMITS } from '@/lib/domain/constants';
import type { OrderDetail, Recipe } from '@/lib/domain/orders';
import { expectedCount, expectedFabricYards, isOverWastageCap, wastagePct } from '@/lib/domain/rules';
import { formatCount, formatPercent, formatYards } from '@/lib/format';
import { fabricRollId, parseWholeNumberInput, parseYardsInput } from '@/lib/validation';

type Errors = Partial<Record<'recipe' | 'qty' | 'roll' | 'yards' | 'form', string>>;

export function CreateOrderSheet({ recipes }: { recipes: Recipe[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recipeId, setRecipeId] = useState('');
  const [qtyText, setQtyText] = useState('');
  const [roll, setRoll] = useState('');
  const [yardsText, setYardsText] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);

  const recipe = recipes.find(entry => String(entry.id) === recipeId);
  const qty = parseWholeNumberInput(qtyText, LIMITS.maxTargetQty);
  const yards = parseYardsInput(yardsText);
  const qtyError = qty.error ?? (qtyText.trim() !== '' && qty.value === 0 ? 'Batch quantity must be at least 1' : null);
  const validQty = qty.value && !qtyError ? qty.value : null;

  // Live preview only. The server repeats this multiplication from the recipe in
  // the database and ignores anything the browser worked out.
  const preview = recipe
    ? {
        components: recipe.components.map(component => ({
          ...component,
          expected: validQty ? expectedCount(validQty, component.piecesPerGarment) : null,
        })),
        expectedFabric: validQty ? expectedFabricYards(recipe.stdFabricYards, validQty) : null,
        wastage: validQty && yards.value ? wastagePct(yards.value, recipe.stdFabricYards, validQty) : null,
      }
    : null;

  function validate(submit: boolean): Errors {
    const next: Errors = {};
    if (!recipe) next.recipe = 'Choose a recipe';
    if (!validQty) next.qty = qtyError ?? 'Enter a batch quantity';
    const rollResult = fabricRollId.safeParse(roll);
    if (!rollResult.success) next.roll = rollResult.error.issues[0]?.message;
    if (yards.error) next.yards = yards.error;
    else if (submit && yards.value == null) next.yards = 'Log the fabric used before sending for verification';
    return next;
  }

  function reset() {
    setRecipeId('');
    setQtyText('');
    setRoll('');
    setYardsText('');
    setErrors({});
    setTouched({});
  }

  async function create(submit: boolean) {
    const next = validate(submit);
    setErrors(next);
    setTouched({ recipe: true, qty: true, roll: true, yards: true });
    const firstInvalid = (['recipe', 'qty', 'roll', 'yards'] as const).find(key => next[key]);
    if (firstInvalid) {
      document.getElementById(`order-${firstInvalid}`)?.focus();
      return;
    }
    setBusy(submit ? 'submit' : 'save');
    const result = await api<{ order: OrderDetail }>('/api/orders', {
      method: 'POST',
      body: {
        recipe_id: recipe!.id,
        target_qty: validQty,
        fabric_roll_id: roll,
        actual_fabric_yds: yards.value,
        submit,
      },
    });
    setBusy(null);
    if (!result.ok) {
      const fieldMap: Record<string, keyof Errors> = { recipe_id: 'recipe', target_qty: 'qty', fabric_roll_id: 'roll', actual_fabric_yds: 'yards' };
      const serverErrors: Errors = { form: result.error.message };
      for (const issue of result.error.issues) {
        const key = fieldMap[issue.path];
        if (key) serverErrors[key] = issue.message;
      }
      setErrors(serverErrors);
      return;
    }
    toast.success(`${result.data.order.orderNo} created`, {
      description: submit ? 'Sent to the verification queue.' : 'Saved as cutting in progress.',
    });
    setOpen(false);
    reset();
    router.push(`/orders/${result.data.order.id}`);
    router.refresh();
  }

  const show = (key: keyof Errors, live?: string | null) => (touched[key] ? errors[key] ?? live ?? undefined : errors[key]);

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)} icon={<Plus aria-hidden className="size-4" />}>
        New cutting order
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          setOpen(value);
          if (!value) setErrors({});
        }}
        variant="sheet"
        title="New cutting order"
        description="Expected piece counts are worked out from the recipe as you type."
      >
        <form
          noValidate
          onSubmit={event => {
            event.preventDefault();
            create(true);
          }}
          className="flex flex-col gap-5 px-6 py-5"
        >
          <Field id="order-recipe" label="Recipe" error={show('recipe')} required>
            {props => (
              <select
                {...props}
                value={recipeId}
                onChange={event => {
                  setRecipeId(event.target.value);
                  setErrors(current => ({ ...current, recipe: undefined }));
                }}
                className="field-control cursor-pointer"
              >
                <option value="" disabled>
                  Choose a recipe…
                </option>
                {recipes.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.recipeCode} · {entry.name} ({entry.stdFabricYards} yd per piece)
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="order-qty" label="Target batch quantity" hint="Whole garments" error={show('qty', qtyError)} required>
              {props => (
                <input
                  {...props}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="e.g. 50"
                  value={qtyText}
                  onChange={event => {
                    setQtyText(event.target.value);
                    setErrors(current => ({ ...current, qty: undefined }));
                    setTouched(current => ({ ...current, qty: true }));
                  }}
                  className="field-control tabular font-mono"
                />
              )}
            </Field>
            <Field id="order-roll" label="Fabric roll ID" hint="As printed on the roll tag" error={show('roll')} required>
              {props => (
                <input
                  {...props}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="FAB-ROLL-882"
                  maxLength={40}
                  value={roll}
                  onChange={event => {
                    setRoll(event.target.value.toUpperCase());
                    setErrors(current => ({ ...current, roll: undefined }));
                  }}
                  onBlur={() => {
                    if (!roll) return;
                    const result = fabricRollId.safeParse(roll);
                    setErrors(current => ({ ...current, roll: result.success ? undefined : result.error.issues[0]?.message }));
                  }}
                  className="field-control font-mono uppercase"
                />
              )}
            </Field>
          </div>

          <Field
            id="order-yards"
            label="Actual fabric used (yards)"
            hint="Leave blank if cutting is still under way; you can log it later."
            error={show('yards', yards.error)}
          >
            {props => (
              <input
                {...props}
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 92.50"
                value={yardsText}
                onChange={event => {
                  setYardsText(event.target.value);
                  setErrors(current => ({ ...current, yards: undefined }));
                  setTouched(current => ({ ...current, yards: true }));
                }}
                className="field-control tabular font-mono"
              />
            )}
          </Field>

          <section aria-labelledby="preview-heading" className="rounded-[12px] border border-line bg-sunken">
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
              <h3 id="preview-heading" className="label-caps text-ink">
                Expected cut pieces
              </h3>
              <span className="text-xs text-muted">{recipe ? `${recipe.name} × ${validQty ?? '—'}` : 'Choose a recipe'}</span>
            </div>
            {preview ? (
              <table className="w-full text-sm">
                <caption className="sr-only">Expected pieces per component for this batch</caption>
                <thead>
                  <tr className="text-left text-muted">
                    <th scope="col" className="px-4 py-2 font-medium">Component</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Per garment</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Expected</th>
                  </tr>
                </thead>
                <tbody aria-live="polite">
                  {preview.components.map(component => (
                    <tr key={component.id} className="border-t border-line">
                      <th scope="row" className="px-4 py-2 text-left font-normal text-ink">{component.componentName}</th>
                      <td className="tabular px-2 py-2 text-right font-mono text-muted">× {component.piecesPerGarment}</td>
                      <td className="tabular px-4 py-2 text-right font-mono font-semibold text-ink">{formatCount(component.expected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-6 text-sm text-muted">The component list and expected counts appear here.</p>
            )}
            {preview && (
              <dl className="grid grid-cols-2 gap-4 border-t border-line px-4 py-3 text-sm">
                <div>
                  <dt className="label-caps text-muted">Expected fabric</dt>
                  <dd className="tabular mt-1 font-mono text-ink">{formatYards(preview.expectedFabric)}</dd>
                </div>
                <div>
                  <dt className="label-caps text-muted">Projected wastage</dt>
                  <dd className="tabular mt-1 flex items-center gap-1.5 font-mono text-ink">
                    {formatPercent(preview.wastage)}
                    {preview.wastage != null && recipe && isOverWastageCap(preview.wastage, recipe.wastageCap) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-excess-tint px-2 py-0.5 font-sans text-xs font-semibold text-excess">
                        <TriangleAlert aria-hidden className="size-3" /> over {recipe.wastageCap}% cap
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </section>

          {errors.form && (
            <p role="alert" className="rounded-[8px] border border-shortage-line bg-shortage-tint px-3 py-2 text-sm font-medium text-shortage">
              {errors.form}
            </p>
          )}

          <div className="sticky bottom-0 -mx-6 flex flex-col-reverse gap-2 border-t border-line bg-surface px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" loading={busy === 'save'} disabled={busy !== null} onClick={() => create(false)}>
              Save as in progress
            </Button>
            <Button type="submit" loading={busy === 'submit'} disabled={busy !== null}>
              Create and send to QC
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
