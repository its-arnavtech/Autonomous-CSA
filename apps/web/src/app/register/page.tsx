import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionForPage } from '../_auth/server-auth';
import { RegisterForm } from './register-form';

const STEPS = [
  'Creates your user account',
  'Provisions a new organization with default settings',
  'Grants you the Owner role and signs you in',
];

export default async function RegisterPage() {
  const session = await getSessionForPage();
  if (session) {
    redirect('/tickets');
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-5 py-12">
      <div className="animate-rise grid w-full max-w-5xl overflow-hidden rounded-[2rem] surface lg:grid-cols-[0.95fr_1.05fr]">
        {/* Brand panel */}
        <section className="relative hidden flex-col justify-between gap-10 border-r border-white/10 bg-gradient-to-b from-cyan-glow/10 via-transparent to-iris-600/15 p-10 lg:flex">
          <div className="flex items-center gap-3">
            <div className="brand-glow flex h-11 w-11 items-center justify-center rounded-xl">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3l7 4v6l-7 4-7-4V7z" stroke="#07080f" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="12" cy="11" r="2" fill="#07080f" />
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-base font-semibold text-mist-50">Autonomous CSA</p>
              <p className="text-[0.68rem] uppercase tracking-[0.22em] text-mist-500">
                Operator Console
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <h1 className="text-3xl font-semibold leading-tight text-mist-50">
              Set up your workspace in one step.
            </h1>
            <p className="max-w-md text-sm leading-6 text-mist-400">
              Registration creates everything you need to start handling support
              requests right away.
            </p>
            <ol className="space-y-3 pt-2">
              {STEPS.map((item, index) => (
                <li key={item} className="flex items-start gap-3 text-sm text-mist-200">
                  <span className="mono mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-glow/15 text-[0.7rem] font-bold text-[#8fe9ff] ring-1 ring-cyan-glow/40">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ol>
          </div>

          <p className="text-xs text-mist-500">Secure by default and ready for production teams.</p>
        </section>

        {/* Form panel */}
        <section className="p-8 sm:p-10">
          <div className="mb-7 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-glow">
              Get started
            </p>
            <h2 className="text-2xl font-semibold text-mist-50">Create your account</h2>
            <p className="text-sm text-mist-400">
              You&apos;ll be the owner of a brand-new organization.
            </p>
          </div>

          <RegisterForm />

          <p className="mt-6 text-sm text-mist-400">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-iris-300 hover:text-iris-400">
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
