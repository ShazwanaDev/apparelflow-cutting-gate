'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Search, X } from 'lucide-react';

/** Searches by order number or fabric roll. Results update as you type. */
export function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const current = params.get('q') ?? '';
    if (value.trim() === current) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set('q', value.trim());
      else next.delete('q');
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [value, params, pathname, router]);

  return (
    <div role="search" className="relative w-full sm:w-80">
      <label htmlFor="order-search" className="sr-only">
        Search orders
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
      <input
        id="order-search"
        type="search"
        value={value}
        maxLength={60}
        onChange={event => setValue(event.target.value)}
        placeholder={placeholder}
        className="field-control rounded-full pr-10 pl-10 [&::-webkit-search-cancel-button]:hidden"
        aria-busy={pending || undefined}
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted hover:bg-blush-tint hover:text-ink"
          aria-label="Clear search"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
