import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionForPage } from '../_auth/server-auth';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const session = await getSessionForPage();
  if (session) {
    redirect('/tickets');
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <section className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-600">
            Autonomous CSA
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            Sign in to the tenant-safe support workspace.
          </h1>
          <p className="max-w-lg text-sm leading-6 text-slate-600">
            Phase 8 routes every request through authenticated membership checks before it reaches the API.
          </p>
        </section>

        <section className="mt-10 rounded-3xl border border-slate-200 bg-slate-50 p-6 lg:mt-0">
          <LoginForm />
          <p className="mt-4 text-sm text-slate-500">
            Need an account?{' '}
            <Link href="/register" className="font-medium text-slate-900">
              Register here
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
