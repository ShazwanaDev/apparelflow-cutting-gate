import type { ReactNode } from 'react';

/** A designed empty state: a short serif line, what it means, and what to do next. */
export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[20px] border border-dashed border-line-strong/60 bg-surface/70 px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-full bg-blush-tint text-ink">{icon}</div>}
      <p className="font-display text-3xl text-ink">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-[8px] bg-line/70 ${className}`} />;
}

export function Panel({ children, className = '', as: Tag = 'section', ...props }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'aside' } & Record<string, unknown>) {
  return (
    <Tag className={`rounded-[20px] border border-line bg-surface shadow-[var(--shadow-raised)] ${className}`} {...props}>
      {children}
    </Tag>
  );
}

/** A label-over-value pair, used for order facts. */
export function Fact({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="label-caps text-muted">{label}</dt>
      <dd className="mt-1 text-base text-ink">{children}</dd>
    </div>
  );
}
