import { redirect } from 'next/navigation';
import { getSessionForPage } from './_auth/server-auth';

export default async function HomePage() {
  const session = await getSessionForPage();
  redirect(session ? '/tickets' : '/login');
}
