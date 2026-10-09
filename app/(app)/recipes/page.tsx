import type { Metadata } from 'next';
import { BookOpen } from 'lucide-react';
import { Panel } from '@/components/ui/states';
import { listRecipes } from '@/lib/domain/orders';
import { getDb } from '@/lib/server/db';
import { loadForPage, requirePageActor } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Recipes' };

export default async function RecipesPage() {
  const actor = await requirePageActor('recipe:read');
  const recipes = await loadForPage(listRecipes(getDb(), actor));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="label-caps text-muted">Bill of materials</p>
        <h1 className="mt-2 font-display text-5xl leading-[0.95] text-ink sm:text-7xl">Recipes</h1>
        <p className="mt-3 max-w-xl text-muted">
          Every cutting order multiplies these pieces by its batch size. Recipes are read-only here.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        {recipes.map(recipe => (
          <Panel key={recipe.id} className="p-6" aria-labelledby={`recipe-${recipe.id}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-muted">{recipe.recipeCode}</p>
                <h2 id={`recipe-${recipe.id}`} className="font-display text-4xl text-ink">
                  {recipe.name}
                </h2>
                <p className="text-sm text-muted">{recipe.category}</p>
              </div>
              <span className="grid size-11 place-items-center rounded-full bg-mint text-ink">
                <BookOpen aria-hidden className="size-5" />
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 rounded-[12px] bg-sunken p-4">
              <div>
                <dt className="label-caps text-muted">Standard fabric</dt>
                <dd className="tabular mt-1 font-mono text-xl text-ink">{recipe.stdFabricYards.toFixed(2)} yd</dd>
                <dd className="text-xs text-muted">per garment</dd>
              </div>
              <div>
                <dt className="label-caps text-muted">Wastage cap</dt>
                <dd className="tabular mt-1 font-mono text-xl text-ink">{recipe.wastageCap.toFixed(1)}%</dd>
                <dd className="text-xs text-muted">over standard</dd>
              </div>
            </dl>
            <table className="mt-5 w-full text-sm">
              <caption className="sr-only">Components of {recipe.name}</caption>
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="label-caps py-2 font-semibold text-muted">
                    Component
                  </th>
                  <th scope="col" className="label-caps py-2 text-right font-semibold text-muted">
                    Pieces per garment
                  </th>
                </tr>
              </thead>
              <tbody>
                {recipe.components.map(component => (
                  <tr key={component.id} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2.5 text-left font-normal text-ink">
                      {component.componentName}
                    </th>
                    <td className="tabular py-2.5 text-right font-mono text-ink">{component.piecesPerGarment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ))}
      </div>
    </div>
  );
}
