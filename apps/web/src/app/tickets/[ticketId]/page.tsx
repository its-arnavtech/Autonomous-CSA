import Link from 'next/link';
import { headers } from 'next/headers';
import { ApprovalReviewCard } from './approval-review-card';
import { AgentStepsPanel } from './agent-steps-panel';
import { DraftCard } from './draft-card';
import { DraftComposer } from './draft-composer';
import { GuardrailsPanel } from './guardrails-panel';
import { KnowledgeRetrievalPanel } from './knowledge-retrieval-panel';
import { TicketControls } from './ticket-controls';

type TicketMessage = {
  id: string;
  direction: string;
  status: string;
  body: string;
  createdAt: string;
};

type TicketDetail = {
  id: string;
  subject: string;
  customerEmail: string;
  customerName?: string | null;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
  drafts: Array<{
    id: string;
    body: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    sentAt?: string | null;
    rejectedReason?: string | null;
    approvals?: Array<{ id: string; status: string }>;
  }>;
  latestAgentRun?: {
    id: string;
    status: string;
    trigger: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    errorMessage?: string | null;
    totalCostCents: number;
  } | null;
  agentSteps: Array<{
    id: string;
    stepType: string;
    status: string;
    inputJson?: unknown;
    outputJson?: unknown;
    errorMessage?: string | null;
    startedAt: string;
    finishedAt?: string | null;
  }>;
};

type TimelineEvent = {
  id: string;
  ts: string;
  type: string;
  sequence: number;
  payload: unknown;
};

type Approval = {
  id: string;
  status: string;
  proposedResponse?: string | null;
  reviewerNote?: string | null;
  createdAt: string;
  updatedAt: string;
  outboundDraft?: {
    id: string;
    status: string;
  } | null;
};

type Retrieval = {
  id: string;
  query: string;
  resultCount: number;
  resultsJson: unknown;
  createdAt: string;
};

type GuardrailCheck = {
  id: string;
  guardrailType: string;
  decision: string;
  reason?: string | null;
  metadata?: unknown;
  createdAt: string;
};

type TicketPageProps = {
  params: { ticketId: string } | Promise<{ ticketId: string }>;
  searchParams: { orgId?: string } | Promise<{ orgId?: string }>;
};

function badgeTone(kind: 'status' | 'priority', value: string) {
  if (kind === 'status') {
    switch (value) {
      case 'RESOLVED':
      case 'CLOSED':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
      case 'WAITING_CUSTOMER':
        return 'bg-amber-50 text-amber-700 ring-amber-200';
      case 'PENDING':
        return 'bg-sky-50 text-sky-700 ring-sky-200';
      default:
        return 'bg-slate-100 text-slate-700 ring-slate-200';
    }
  }

  switch (value) {
    case 'URGENT':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'HIGH':
      return 'bg-orange-50 text-orange-700 ring-orange-200';
    case 'NORMAL':
      return 'bg-blue-50 text-blue-700 ring-blue-200';
    default:
      return 'bg-zinc-100 text-zinc-700 ring-zinc-200';
  }
}

function ErrorPanel({
  ticketId,
  orgId,
  details,
}: {
  ticketId: string;
  orgId: string;
  details: string;
}) {
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-6 py-8">
      <div>
        <p className="text-sm text-slate-500">Org: {orgId}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          Ticket Detail
        </h1>
        <p className="mt-2 break-all text-sm text-slate-500">{ticketId}</p>
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
        <h2 className="text-lg font-semibold text-rose-800">Failed to load ticket data</h2>
        <pre className="mt-3 overflow-auto rounded-xl bg-white/80 p-3 text-xs text-slate-800">
          {details}
        </pre>
      </div>
    </main>
  );
}

export default async function TicketPage({ params, searchParams }: TicketPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const ticketId = resolvedParams.ticketId;
  const orgId = resolvedSearchParams.orgId ?? 'org_demo';

  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const base = `${proto}://${host}`;
  const detailUrl = `${base}/api/tickets/${encodeURIComponent(ticketId)}?orgId=${encodeURIComponent(orgId)}`;
  const timelineUrl = `${base}/api/tickets/${encodeURIComponent(ticketId)}/timeline?orgId=${encodeURIComponent(orgId)}`;
  const approvalsUrl = `${base}/api/tickets/${encodeURIComponent(ticketId)}/approvals?orgId=${encodeURIComponent(orgId)}`;
  const retrievalsUrl = `${base}/api/tickets/${encodeURIComponent(ticketId)}/retrievals?orgId=${encodeURIComponent(orgId)}`;
  const guardrailsUrl = `${base}/api/tickets/${encodeURIComponent(ticketId)}/guardrails?orgId=${encodeURIComponent(orgId)}`;

  let detailRes: Response;
  let timelineRes: Response;
  let approvalsRes: Response;
  let retrievalsRes: Response;
  let guardrailsRes: Response;

  try {
    [detailRes, timelineRes, approvalsRes, retrievalsRes, guardrailsRes] =
      await Promise.all([
        fetch(detailUrl, { cache: 'no-store' }),
        fetch(timelineUrl, { cache: 'no-store' }),
        fetch(approvalsUrl, { cache: 'no-store' }),
        fetch(retrievalsUrl, { cache: 'no-store' }),
        fetch(guardrailsUrl, { cache: 'no-store' }),
      ]);
  } catch (error) {
    return (
      <ErrorPanel
        ticketId={ticketId}
        orgId={orgId}
        details={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (
    !detailRes.ok ||
    !timelineRes.ok ||
    !approvalsRes.ok ||
    !retrievalsRes.ok ||
    !guardrailsRes.ok
  ) {
    const failures = await Promise.all([
      detailRes.text(),
      timelineRes.text(),
      approvalsRes.text(),
      retrievalsRes.text(),
      guardrailsRes.text(),
    ]);

    return (
      <ErrorPanel
        ticketId={ticketId}
        orgId={orgId}
        details={JSON.stringify(
          {
            detail: failures[0],
            timeline: failures[1],
            approvals: failures[2],
            retrievals: failures[3],
            guardrails: failures[4],
          },
          null,
          2,
        )}
      />
    );
  }

  const [ticket, timeline, approvals, retrievals, guardrails] =
    (await Promise.all([
      detailRes.json(),
      timelineRes.json(),
      approvalsRes.json(),
      retrievalsRes.json(),
      guardrailsRes.json(),
    ])) as [TicketDetail, TimelineEvent[], Approval[], Retrieval[], GuardrailCheck[]];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href={`/tickets?orgId=${encodeURIComponent(orgId)}`}
              className="text-sm font-medium text-slate-500 underline underline-offset-4"
            >
              Back to inbox
            </Link>
            <Link
              href={`/settings?orgId=${encodeURIComponent(orgId)}`}
              className="text-sm font-medium text-slate-500 underline underline-offset-4"
            >
              Settings
            </Link>
            <Link
              href={`/knowledge?orgId=${encodeURIComponent(orgId)}`}
              className="text-sm font-medium text-slate-500 underline underline-offset-4"
            >
              Knowledge
            </Link>
          </div>
          <div>
            <p className="text-sm text-slate-500">Org: {orgId}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {ticket.subject}
            </h1>
            <p className="mt-2 break-all text-sm text-slate-500">
              {ticket.customerName ?? ticket.customerEmail}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${badgeTone('status', ticket.status)}`}
          >
            {ticket.status}
          </span>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${badgeTone('priority', ticket.priority)}`}
          >
            {ticket.priority}
          </span>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Customer Conversation</h2>
            <div className="mt-4 space-y-3">
              {ticket.messages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages yet.</p>
              ) : (
                ticket.messages.map((message) => (
                  <article key={message.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm font-medium text-slate-800">
                        {message.direction === 'INBOUND' ? 'Customer' : 'Support'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {message.status} · {new Date(message.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {message.body}
                    </p>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Agent Timeline</h2>
            <div className="mt-4 space-y-3">
              {timeline.length === 0 ? (
                <p className="text-sm text-slate-500">No timeline events yet.</p>
              ) : (
                timeline.map((event) => (
                  <article key={event.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-medium text-slate-900">{event.type}</div>
                        <div className="text-xs text-slate-400">Sequence {event.sequence}</div>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(event.ts).toLocaleString()}
                      </span>
                    </div>
                    <pre className="mt-3 overflow-auto rounded-2xl bg-slate-950 p-3 text-xs text-slate-100">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Ticket Metadata</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <dt>Email</dt>
                <dd className="break-all text-right text-slate-900">{ticket.customerEmail}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Created</dt>
                <dd className="text-right text-slate-900">
                  {new Date(ticket.createdAt).toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Updated</dt>
                <dd className="text-right text-slate-900">
                  {new Date(ticket.updatedAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Latest Agent Run</h2>
            {!ticket.latestAgentRun ? (
              <p className="mt-4 text-sm text-slate-500">No agent run recorded yet.</p>
            ) : (
              <dl className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <dt>Status</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {ticket.latestAgentRun.status}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Trigger</dt>
                  <dd className="text-right text-slate-900">
                    {ticket.latestAgentRun.trigger}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Started</dt>
                  <dd className="text-right text-slate-900">
                    {ticket.latestAgentRun.startedAt
                      ? new Date(ticket.latestAgentRun.startedAt).toLocaleString()
                      : 'Not started'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Finished</dt>
                  <dd className="text-right text-slate-900">
                    {ticket.latestAgentRun.finishedAt
                      ? new Date(ticket.latestAgentRun.finishedAt).toLocaleString()
                      : 'In progress'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Cost</dt>
                  <dd className="text-right text-slate-900">
                    ${ (ticket.latestAgentRun.totalCostCents / 100).toFixed(2) }
                  </dd>
                </div>
                {ticket.latestAgentRun.errorMessage ? (
                  <div className="rounded-2xl bg-rose-50 p-3 text-rose-700">
                    {ticket.latestAgentRun.errorMessage}
                  </div>
                ) : null}
              </dl>
            )}
          </div>

          <AgentStepsPanel steps={ticket.agentSteps} />

          <KnowledgeRetrievalPanel
            retrievals={retrievals}
            steps={ticket.agentSteps}
          />

          <GuardrailsPanel checks={guardrails} />

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Drafts</h2>
            </div>
            <div className="mt-4 space-y-3">
              {ticket.drafts.length === 0 ? (
                <p className="text-sm text-slate-500">No drafts created yet.</p>
              ) : (
                ticket.drafts.map((draft) => (
                  <DraftCard key={draft.id} draft={draft} orgId={orgId} />
                ))
              )}
            </div>
            <div className="mt-4">
              <DraftComposer orgId={orgId} ticketId={ticket.id} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Approvals</h2>
            <div className="mt-4 space-y-3">
              {approvals.length === 0 ? (
                <p className="text-sm text-slate-500">No approvals created yet.</p>
              ) : (
                approvals.map((approval) => (
                  <ApprovalReviewCard
                    key={approval.id}
                    approval={approval}
                    orgId={orgId}
                  />
                ))
              )}
            </div>
          </div>

          <TicketControls
            ticketId={ticket.id}
            orgId={orgId}
            status={ticket.status as 'OPEN' | 'PENDING' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'}
            priority={ticket.priority as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'}
          />
        </div>
      </section>
    </main>
  );
}
