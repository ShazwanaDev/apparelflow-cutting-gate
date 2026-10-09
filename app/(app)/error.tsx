'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="pt-10">
      <EmptyState
        title="This page could not load"
        action={
          <Button onClick={reset} icon={<RotateCcw aria-hidden className="size-4" />}>
            Try again
          </Button>
        }
      >
        Something went wrong while fetching the latest data. Nothing you entered has been changed. Try again, and if it keeps
        happening, reload the page.
      </EmptyState>
    </div>
  );
}
