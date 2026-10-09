import { redirect } from 'next/navigation';
import { HOME_BY_ROLE } from '@/lib/domain/permissions';
import { currentActor } from '@/lib/server/page-session';

export default async function Home() {
  const actor = await currentActor();
  redirect(actor ? HOME_BY_ROLE[actor.role] : '/login');
}
