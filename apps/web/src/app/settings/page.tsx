import Link from 'next/link';
import { headers } from 'next/headers';
import { SettingsForm } from './settings-form';

type SettingsPageProps = {
  searchParams: { orgId?: string } | Promise<{ orgId?: string }>;
};

type OrganizationSettings = {
  autoRespond: boolean;
  requireHumanApproval: boolean;
  maxAgentCostCents: number;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const orgId = resolvedSearchParams.orgId ?? 'org_demo';
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const base = `${proto}://${host}`;
  const settingsUrl = `${base}/api/orgs/${encodeURIComponent(orgId)}/settings`;

  const res = await fetch(settingsUrl, { cache: 'no-store' });

  if (!res.ok) {
    const detail = await res.text();

    return (
      <main className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <Link
          href={`/tickets?orgId=${encodeURIComponent(orgId)}`}
          className="text-sm font-medium text-slate-500 underline underline-offset-4"
        >
          Back to inbox
        </Link>

        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h1 className="text-2xl font-semibold text-rose-800">Failed to load settings</h1>
          <p className="mt-2 break-all text-xs text-rose-600">URL: {settingsUrl}</p>
          <pre className="mt-3 overflow-auto rounded-xl bg-white/80 p-3 text-xs text-slate-800">
            {detail}
          </pre>
        </div>
      </main>
    );
  }

  const settings = (await res.json()) as OrganizationSettings;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href={`/tickets?orgId=${encodeURIComponent(orgId)}`}
            className="text-sm font-medium text-slate-500 underline underline-offset-4"
          >
            Back to inbox
          </Link>
          <Link
            href={`/knowledge?orgId=${encodeURIComponent(orgId)}`}
            className="text-sm font-medium text-slate-500 underline underline-offset-4"
          >
            Knowledge
          </Link>
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Support Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure the approval and automation defaults for this organization.
          </p>
        </div>
      </div>

      <SettingsForm orgId={orgId} initialSettings={settings} />
    </main>
  );
}
