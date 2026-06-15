import { AppShell } from '../_auth/app-shell';
import { OrganizationSelection } from '../_auth/organization-selection';
import { requireSessionForPage } from '../_auth/server-auth';
import { SettingsForm } from './settings-form';

type OrganizationSettings = {
  autoRespond: boolean;
  requireHumanApproval: boolean;
  maxAgentCostCents: number;
  maxAutoSendCostCents: number;
  requireApprovalForLowConfidence: boolean;
  blockOnPiiDetection: boolean;
  minCriticCompletenessScore: number;
};

export default async function SettingsPage() {
  const context = await requireSessionForPage();

  if (!context.activeMembership) {
    return (
      <AppShell
        session={context.session}
        activeMembership={context.activeMembership}
      >
        <OrganizationSelection session={context.session} />
      </AppShell>
    );
  }

  const response = await fetch(`${context.baseUrl}/api/orgs/settings`, {
    cache: 'no-store',
    headers: { cookie: context.cookieHeader },
  });

  let content: React.ReactNode;
  if (!response.ok) {
    const detail = await response.text();
    content = (
      <main className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="text-2xl font-semibold text-rose-800">
            Failed to load settings
          </h2>
          <pre className="mt-3 overflow-auto rounded-xl bg-white/80 p-3 text-xs text-slate-800">
            {detail}
          </pre>
        </div>
      </main>
    );
  } else {
    const settings = (await response.json()) as OrganizationSettings;
    content = (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            Support Settings
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure the approval and automation defaults for this organization.
          </p>
        </div>

        <SettingsForm initialSettings={settings} />
      </main>
    );
  }

  return (
    <AppShell
      session={context.session}
      activeMembership={context.activeMembership}
    >
      {content}
    </AppShell>
  );
}
