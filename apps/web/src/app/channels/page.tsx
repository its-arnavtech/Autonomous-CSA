import { AppShell } from '../_auth/app-shell';
import { OrganizationSelection } from '../_auth/organization-selection';
import { requireSessionForPage } from '../_auth/server-auth';
import { ChannelActions, CreateMockConnectionForm } from './channel-actions';

type ChannelConnection = {
  id: string;
  publicId: string;
  provider: string;
  displayName: string;
  status: string;
  externalAccountId: string | null;
  inboundAddress: string | null;
  isDefault: boolean;
  lastSuccessfulEventAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastErrorRedacted: string | null;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
};

function canManage(role?: string | null) {
  return role === 'OWNER' || role === 'ADMIN';
}

export default async function ChannelsPage() {
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

  const response = await fetch(`${context.baseUrl}/api/channel-connections`, {
    cache: 'no-store',
    headers: { cookie: context.cookieHeader },
  });
  const manage = canManage(context.activeMembership.role);

  let content: React.ReactNode;
  if (!response.ok) {
    content = (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/15 p-5">
          <h2 className="text-lg font-semibold text-rose-200">
            Failed to load channel connections
          </h2>
          <pre className="mt-3 overflow-auto rounded-md bg-ink-850/80 p-3 text-xs text-mist-100">
            {await response.text()}
          </pre>
        </div>
      </main>
    );
  } else {
    const connections = (await response.json()) as ChannelConnection[];
    content = (
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-mist-50">
            Channel Connections
          </h2>
          <p className="mt-2 text-sm text-mist-400">
            Tenant-scoped inbound and outbound support channels for{' '}
            <span className="font-medium text-mist-200">
              {context.activeMembership.organizationName}
            </span>
          </p>
        </div>

        <CreateMockConnectionForm canManage={manage} />

        <section className="rounded-lg border border-white/10 bg-ink-850/70 shadow-sm">
          <div className="border-b border-white/10 px-5 py-4">
            <h3 className="text-lg font-semibold text-mist-50">
              Connections
            </h3>
          </div>
          {connections.length === 0 ? (
            <div className="px-5 py-8 text-sm text-mist-400">
              No channel connections are configured.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {connections.map((connection) => (
                <article
                  key={connection.id}
                  className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto]"
                >
                  <div className="space-y-2 text-sm text-mist-300">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-semibold text-mist-50">
                        {connection.displayName}
                      </h4>
                      <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-semibold text-mist-200">
                        {connection.status}
                      </span>
                      {connection.isDefault ? (
                        <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-300">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <div>Provider: {connection.provider}</div>
                    <div>Inbound: {connection.inboundAddress ?? 'n/a'}</div>
                    <div className="break-all">
                      Webhook public id: {connection.publicId}
                    </div>
                    <div>
                      Last successful event:{' '}
                      {connection.lastSuccessfulEventAt
                        ? new Date(connection.lastSuccessfulEventAt).toLocaleString()
                        : 'n/a'}
                    </div>
                    {connection.lastErrorCode ? (
                      <div className="rounded-md bg-rose-500/15 p-3 text-rose-300">
                        {connection.lastErrorCode}: {connection.lastErrorRedacted}
                      </div>
                    ) : null}
                  </div>
                  <ChannelActions
                    connectionId={connection.id}
                    status={connection.status}
                    canManage={manage}
                  />
                </article>
              ))}
            </div>
          )}
        </section>
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
