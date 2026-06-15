import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionForPage } from '../_auth/server-auth';
import { RegisterForm } from './register-form';

export default async function RegisterPage() {
  const session = await getSessionForPage();
  if (session) {
    redirect('/tickets');
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.16),_transparent_24%),linear-gradient(180deg,_#fff7ed_0%,_#fffbeb_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-orange-200 bg-white/90 p-8 shadow-xl backdrop-blur lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        <section className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-600">
            Secure Bootstrap
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            Create your account, organization, and owner membership in one step.
          </h1>
          <p className="max-w-lg text-sm leading-6 text-slate-600">
            Registration creates the user, organization, default settings, owner membership, and a live authenticated session.
          </p>
        </section>

        <section className="mt-10 rounded-3xl border border-orange-200 bg-orange-50/60 p-6 lg:mt-0">
          <RegisterForm />
          <p className="mt-4 text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-slate-900">
              Sign in
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
