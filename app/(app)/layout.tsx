import { AppShell } from '@/components/shell/app-shell';
import { requirePageActor } from '@/lib/server/page-session';

// Every page under here reads the session cookie and live data.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  return <AppShell actor={actor}>{children}</AppShell>;
}
