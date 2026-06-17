import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionForPage } from '../_auth/server-auth';
import { LoginForm } from './login-form';

const HIGHLIGHTS = [
  'Tenant-isolated access with membership checks',
  'Guardrails for PII, secrets, cost, and grounding',
  'Approval review before any reply is sent',
];

export default async function LoginPage() {
  const session = await getSessionForPage();
  if (session) {
    redirect('/tickets');
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-5 py-12">
      <div className="animate-rise grid w-full max-w-5xl overflow-hidden rounded-[2rem] surface lg:grid-cols-[1.05fr_0.95fr]">
        {/* Brand panel */}
        <section className="relative hidden flex-col justify-between gap-10 border-r border-white/10 bg-gradient-to-b from-iris-600/15 via-transparent to-cyan-glow/5 p-10 lg:flex">
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
              The operator console for your support desk.
            </h1>
            <p className="max-w-md text-sm leading-6 text-mist-400">
              Triage, draft, and resolve customer conversations from one place,
              with full visibility into every step.
            </p>
            <ul className="space-y-3 pt-2">
              {HIGHLIGHTS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-mist-200">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-iris-500/20 ring-1 ring-iris-500/40">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-mist-500">
            Multi-tenant, audited, and built for production support teams.
          </p>
        </section>

        {/* Form panel */}
        <section className="p-8 sm:p-10">
          <div className="mb-7 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-iris-300">
              Welcome back
            </p>
            <h2 className="text-2xl font-semibold text-mist-50">Sign in</h2>
            <p className="text-sm text-mist-400">
              Access your organization&apos;s support workspace.
            </p>
          </div>

          <LoginForm />

          <p className="mt-6 text-sm text-mist-400">
            Need an account?{' '}
            <Link href="/register" className="font-medium text-iris-300 hover:text-iris-400">
              Create one
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
