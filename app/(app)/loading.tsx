import { Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 pt-6">
        <Skeleton className="h-16 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-28" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
