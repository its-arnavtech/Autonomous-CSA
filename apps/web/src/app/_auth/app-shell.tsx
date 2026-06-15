import Link from 'next/link';
import { AuthClientControls } from './auth-client-controls';
import type { SessionData, SessionMembership } from './server-auth';

type AppShellProps = {
  session: SessionData;
  activeMembership: SessionMembership | null;
  children: React.ReactNode;
};

export function AppShell({
  session,
  activeMembership,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
              <Link href="/tickets" className="font-medium text-slate-700">
                Tickets
              </Link>
              <Link href="/knowledge" className="font-medium text-slate-700">
                Knowledge
              </Link>
              <Link href="/settings" className="font-medium text-slate-700">
                Settings
              </Link>
              <Link href="/operations" className="font-medium text-slate-700">
                Operations
              </Link>
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {activeMembership?.organizationName ?? 'Select an organization'}
              </h1>
              <p className="text-sm text-slate-500">
                {session.user.displayName ?? session.user.email}
                {' · '}
                {activeMembership?.role ?? 'No organization selected'}
              </p>
            </div>
          </div>

          <AuthClientControls
            memberships={session.memberships}
            activeOrganizationId={activeMembership?.organizationId ?? null}
          />
        </div>
      </header>

      {children}
    </div>
  );
}
