import { AuthClientControls } from './auth-client-controls';
import { ConsoleNav } from './console-nav';
import type { SessionData, SessionMembership } from './server-auth';

type AppShellProps = {
  session: SessionData;
  activeMembership: SessionMembership | null;
  children: React.ReactNode;
};

function initials(value: string) {
  const parts = value.trim().split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? 'A').concat(parts[1]?.[0] ?? '').toUpperCase();
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="brand-glow flex h-10 w-10 items-center justify-center rounded-xl">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3l7 4v6l-7 4-7-4V7z"
            stroke="#07080f"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="11" r="2" fill="#07080f" />
        </svg>
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-mist-50">Autonomous CSA</p>
        <p className="text-[0.68rem] uppercase tracking-[0.22em] text-mist-500">
          Operator Console
        </p>
      </div>
    </div>
  );
}

export function AppShell({
  session,
  activeMembership,
  children,
}: AppShellProps) {
  const identity = session.user.displayName ?? session.user.email;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[16.5rem] shrink-0 flex-col gap-6 border-r border-white/10 bg-ink-900/40 px-4 py-6 backdrop-blur-xl lg:flex">
        <div className="px-2">
          <BrandMark />
        </div>

        <div className="px-1">
          <p className="px-2 pb-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-mist-500">
            Workspace
          </p>
          <ConsoleNav />
        </div>

        <div className="mt-auto px-1">
          <div className="surface rounded-2xl p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-iris-500/20 text-xs font-bold text-iris-300 ring-1 ring-iris-500/30">
                {initials(identity)}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-medium text-mist-50">
                  {identity}
                </p>
                <p className="truncate text-xs text-mist-500">
                  {activeMembership?.role ?? 'No org selected'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-ink-950/70 backdrop-blur-xl">
          <div className="flex flex-col gap-3 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="lg:hidden">
                <BrandMark />
              </div>
              <div className="hidden lg:block">
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-flex h-2 w-2 animate-pulse-soft rounded-full bg-emerald-glow shadow-[0_0_10px_2px_rgba(52,226,168,0.6)]" />
                  <h1 className="text-lg font-semibold text-mist-50">
                    {activeMembership?.organizationName ?? 'Select an organization'}
                  </h1>
                </div>
                <p className="mt-0.5 text-xs text-mist-500">
                  Signed in as {identity}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto lg:overflow-visible">
              <div className="flex gap-1 lg:hidden">
                <ConsoleNav orientation="horizontal" />
              </div>
              <AuthClientControls
                memberships={session.memberships}
                activeOrganizationId={activeMembership?.organizationId ?? null}
              />
            </div>
          </div>
        </header>

        <div className="animate-rise flex-1">{children}</div>
      </div>
    </div>
  );
}
