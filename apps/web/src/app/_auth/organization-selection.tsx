import { AuthClientControls } from './auth-client-controls';
import type { SessionData } from './server-auth';

export function OrganizationSelection({ session }: { session: SessionData }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <div className="surface rounded-3xl p-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-iris-500/15 ring-1 ring-iris-500/30">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
          </svg>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-mist-50">
          Choose an organization
        </h1>
        <p className="mt-3 text-sm text-mist-400">
          Your account belongs to one or more organizations. Select one to continue.
        </p>

        <div className="mt-6">
          <AuthClientControls memberships={session.memberships} />
        </div>
      </div>
    </main>
  );
}
