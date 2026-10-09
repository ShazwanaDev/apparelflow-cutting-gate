import { SearchX } from 'lucide-react';
import { Logo } from '@/components/shell/app-shell';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 px-4 py-8">
      <Logo />
      <EmptyState
        icon={<SearchX aria-hidden className="size-5" />}
        title="Nothing here"
        action={<ButtonLink href="/">Go to my work</ButtonLink>}
      >
        That page or batch does not exist, or it is not available to your role.
        <span className="mt-2 block font-mono text-xs">HTTP 404 · Not found</span>
      </EmptyState>
    </main>
  );
}
