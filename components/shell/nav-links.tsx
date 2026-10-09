'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ links }: { links: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {links.map(link => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium transition-colors ${
              active ? 'text-ink underline decoration-coral decoration-2 underline-offset-[6px]' : 'text-muted hover:text-ink'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
