import Link from 'next/link';
import { AppShell } from '../_auth/app-shell';
import { OrganizationSelection } from '../_auth/organization-selection';
import { requireSessionForPage } from '../_auth/server-auth';
import { canManageOperations, isSupportedOperationsRole } from './access';
import { OperationsActions } from './operations-actions';

type OperationsSummary = {
  ticketsByStatus: Array<{ status: string; count: number }>;
  runsByStatus: Array<{ status: string; count: number }>;
  blockedRuns: number;
  pendingApprovals: number;
  recentFailures: Array<{
    id: string;
    queueName: string;
    jobName: string;
    errorCode: string;
    safeErrorMessage: string;
    failedAt: string;
    resolvedAt: string | null;
    ticketId: string | null;
    runId: string | null;
    correlationId: string | null;
  }>;
  llmUsage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
  };
  averageRunDurationMs: number;
  queueHealth: {
    activeRuns: number;
    unresolvedFailures: number;
  };
  channelDelivery: {
    pendingOutbound: number;
    retryingOutbound: number;
    deadLetterOutbound: number;
    recentFailures: Array<{
      id: string;
      ticketId: string;
      status: string;
      lastErrorCode: string | null;
      lastErrorRedacted: string | null;
      updatedAt: string;
    }>;
  };
};

type OperationsRun = {
  id: string;
  status: string;
  trigger: string;
  correlationId: string | null;
  createdAt: string;
  finishedAt: string | null;
  ticket: {
    id: string;
    subject: string;
    status: string;
    customerEmail: string;
  };
};

type AuditEvent = {
  id: string;
  type: string;
  ticketId: string;
  runId: string | null;
  correlationId: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
};

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  if (!isSupportedOperationsRole(context.activeMembership.role)) {
    return (
      <AppShell
        session={context.session}
        activeMembership={context.activeMembership}
      >
        <main className="mx-auto max-w-4xl px-6 py-8">
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-900">
              Operations access is not available for this role
            </h2>
            <p className="mt-2 text-sm text-amber-800">
              Contact an organization owner or admin if you need access.
            </p>
          </div>
        </main>
      </AppShell>
    );
  }

  const params = ((await searchParams) ?? {}) as Record<string, string | undefined>;
  const auditQuery = new URLSearchParams();
  if (params.eventType) {
    auditQuery.set('eventType', params.eventType);
  }
  if (params.correlationId) {
    auditQuery.set('correlationId', params.correlationId);
  }

  const [summaryResponse, runsResponse, failuresResponse, auditResponse] =
    await Promise.all([
      fetch(`${context.baseUrl}/api/operations/summary`, {
        cache: 'no-store',
        headers: { cookie: context.cookieHeader },
      }),
      fetch(`${context.baseUrl}/api/operations/runs?limit=8`, {
        cache: 'no-store',
        headers: { cookie: context.cookieHeader },
      }),
      fetch(`${context.baseUrl}/api/operations/failures?limit=8`, {
        cache: 'no-store',
        headers: { cookie: context.cookieHeader },
      }),
      fetch(
        `${context.baseUrl}/api/operations/audit?limit=20${
          auditQuery.toString() ? `&${auditQuery.toString()}` : ''
        }`,
        {
          cache: 'no-store',
          headers: { cookie: context.cookieHeader },
        },
      ),
    ]);

  const canManage = canManageOperations(context.activeMembership.role);

  let content: React.ReactNode;
  if (
    !summaryResponse.ok ||
    !runsResponse.ok ||
    !failuresResponse.ok ||
    !auditResponse.ok
  ) {
    const details = await Promise.all([
      summaryResponse.text(),
      runsResponse.text(),
      failuresResponse.text(),
      auditResponse.text(),
    ]);

    content = (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6">
          <h2 className="text-lg font-semibold text-rose-800">
            Failed to load operations view
          </h2>
          <pre className="mt-3 overflow-auto rounded-2xl bg-white/80 p-4 text-xs text-slate-800">
            {details.join('\n\n')}
          </pre>
        </div>
      </main>
    );
  } else {
    const summary = (await summaryResponse.json()) as OperationsSummary;
    const runs = (await runsResponse.json()) as OperationsRun[];
    const failures = (await failuresResponse.json()) as OperationsSummary['recentFailures'];
    const audit = (await auditResponse.json()) as AuditEvent[];

    content = (
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            Operations
          </h2>
          <p className="text-sm text-slate-500">
            Tenant-scoped diagnostics for{' '}
            <span className="font-medium text-slate-700">
              {context.activeMembership.organizationName}
            </span>
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Active queue work</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.queueHealth.activeRuns}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Unresolved failures: {summary.queueHealth.unresolvedFailures}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Blocked runs</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.blockedRuns}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Pending approvals: {summary.pendingApprovals}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">LLM usage</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.llmUsage.inputTokens + summary.llmUsage.outputTokens}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Estimated cost: {formatCurrency(summary.llmUsage.estimatedCostCents)}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Average run duration</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.averageRunDurationMs} ms
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {summary.runsByStatus.map((item) => `${item.status}: ${item.count}`).join(' · ')}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Pending outbound</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.channelDelivery.pendingOutbound}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Retry scheduled</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.channelDelivery.retryingOutbound}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Dead-lettered delivery</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.channelDelivery.deadLetterOutbound}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Recent runs</h3>
            </div>
            <div className="divide-y divide-slate-200">
              {runs.map((run) => (
                <div key={run.id} className="space-y-2 px-5 py-4 text-sm text-slate-600">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-medium text-slate-900">{run.ticket.subject}</div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {run.status}
                    </span>
                  </div>
                  <div>Trigger: {run.trigger}</div>
                  <div>Correlation: {run.correlationId ?? 'n/a'}</div>
                  <div>Created: {new Date(run.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Recent failures</h3>
            </div>
            <div className="divide-y divide-slate-200">
              {failures.map((failure) => (
                <div key={failure.id} className="space-y-3 px-5 py-4 text-sm text-slate-600">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-medium text-slate-900">{failure.errorCode}</div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {failure.resolvedAt ? 'Resolved' : 'Open'}
                    </span>
                  </div>
                  <div>{failure.safeErrorMessage}</div>
                  <div>Run: {failure.runId ?? 'n/a'}</div>
                  <div>Correlation: {failure.correlationId ?? 'n/a'}</div>
                  <div>Failed: {new Date(failure.failedAt).toLocaleString()}</div>
                  <OperationsActions
                    failureId={failure.id}
                    canManage={canManage}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Audit search</h3>
              <p className="text-sm text-slate-500">
                Filter by event type or correlation ID, then export CSV if needed.
              </p>
            </div>
            <form className="flex flex-wrap gap-2" method="get">
              <input
                name="eventType"
                defaultValue={params.eventType}
                placeholder="Event type"
                className="rounded-full border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                name="correlationId"
                defaultValue={params.correlationId}
                placeholder="Correlation ID"
                className="rounded-full border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Apply
              </button>
              <Link
                href={`/api/operations/audit/export${
                  auditQuery.toString() ? `?${auditQuery.toString()}` : ''
                }`}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Export CSV
              </Link>
            </form>
          </div>
          <div className="divide-y divide-slate-200">
            {audit.map((event) => (
              <div key={event.id} className="space-y-2 px-5 py-4 text-sm text-slate-600">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{event.type}</div>
                  <div className="text-xs text-slate-400">
                    {new Date(event.createdAt).toLocaleString()}
                  </div>
                </div>
                <div>Run: {event.runId ?? 'n/a'}</div>
                <div>Correlation: {event.correlationId ?? 'n/a'}</div>
                <pre className="overflow-auto rounded-2xl bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
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
