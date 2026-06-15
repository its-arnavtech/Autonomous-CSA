import { AuthClientControls } from './auth-client-controls';
import type { SessionData } from './server-auth';

export function OrganizationSelection({ session }: { session: SessionData }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Choose an organization
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Your account belongs to one or more organizations. Select one to continue.
        </p>

        <div className="mt-6">
          <AuthClientControls memberships={session.memberships} />
        </div>
      </div>
    </main>
  );
}
