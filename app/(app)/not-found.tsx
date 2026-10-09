import { SearchX } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export default function NotFound() {
  return (
    <div className="pt-10">
      <EmptyState
        icon={<SearchX aria-hidden className="size-5" />}
        title="Nothing here"
        action={<ButtonLink href="/">Go to my work</ButtonLink>}
      >
        That page or batch does not exist, or it is not available to your role.
        <span className="mt-2 block font-mono text-xs">HTTP 404 · Not found</span>
      </EmptyState>
    </div>
  );
}
