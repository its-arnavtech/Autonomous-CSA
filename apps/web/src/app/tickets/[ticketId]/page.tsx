import Link from 'next/link';
import { AppShell } from '../../_auth/app-shell';
import { OrganizationSelection } from '../../_auth/organization-selection';
import { requireSessionForPage } from '../../_auth/server-auth';
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
};

type ChannelConversation = {
  id: string;
  subject: string | null;
  status: string;
  externalThreadId: string | null;
  channel: {
    provider: string;
    displayName: string;
    status: string;
  };
  customer: {
    email: string | null;
    displayName: string | null;
  } | null;
  lastMessageAt: string;
} | null;

type ChannelMessage = {
  id: string;
  direction: string;
  subject: string | null;
  textBody: string | null;
  sanitizedHtmlBody: string | null;
  providerMessageId: string | null;
  createdAt: string;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
  }>;
};

type OutboundMessage = {
  id: string;
  status: string;
  subject: string | null;
  textBody: string;
  providerMessageId: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  lastErrorRedacted: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  deliveryAttempts: Array<{
    id: string;
    attemptNumber: number;
    outcome: string;
    retryable: boolean;
    errorRedacted: string | null;
    startedAt: string;
    completedAt: string | null;
  }>;
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
  organizationLabel,
  details,
}: {
  ticketId: string;
  organizationLabel: string;
  details: string;
}) {
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-6 py-8">
      <div>
        <p className="text-sm text-slate-500">Org: {organizationLabel}</p>
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

export default async function TicketPage({ params }: TicketPageProps) {
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

  const resolvedParams = await params;
  const ticketId = resolvedParams.ticketId;
  const detailUrl = `${context.baseUrl}/api/tickets/${encodeURIComponent(ticketId)}`;
  const timelineUrl = `${context.baseUrl}/api/tickets/${encodeURIComponent(ticketId)}/timeline`;
  const approvalsUrl = `${context.baseUrl}/api/tickets/${encodeURIComponent(ticketId)}/approvals`;
  const retrievalsUrl = `${context.baseUrl}/api/tickets/${encodeURIComponent(ticketId)}/retrievals`;
  const guardrailsUrl = `${context.baseUrl}/api/tickets/${encodeURIComponent(ticketId)}/guardrails`;
  const conversationUrl = `${context.baseUrl}/api/tickets/${encodeURIComponent(ticketId)}/conversation`;
  const channelMessagesUrl = `${context.baseUrl}/api/tickets/${encodeURIComponent(ticketId)}/channel-messages`;
  const outboundMessagesUrl = `${context.baseUrl}/api/tickets/${encodeURIComponent(ticketId)}/outbound-messages`;

  let detailRes: Response;
  let timelineRes: Response;
  let approvalsRes: Response;
  let retrievalsRes: Response;
  let guardrailsRes: Response;
  let conversationRes: Response;
  let channelMessagesRes: Response;
  let outboundMessagesRes: Response;

  try {
    [
      detailRes,
      timelineRes,
      approvalsRes,
      retrievalsRes,
      guardrailsRes,
      conversationRes,
      channelMessagesRes,
      outboundMessagesRes,
    ] =
      await Promise.all([
        fetch(detailUrl, { cache: 'no-store', headers: { cookie: context.cookieHeader } }),
        fetch(timelineUrl, { cache: 'no-store', headers: { cookie: context.cookieHeader } }),
        fetch(approvalsUrl, { cache: 'no-store', headers: { cookie: context.cookieHeader } }),
        fetch(retrievalsUrl, { cache: 'no-store', headers: { cookie: context.cookieHeader } }),
        fetch(guardrailsUrl, { cache: 'no-store', headers: { cookie: context.cookieHeader } }),
        fetch(conversationUrl, { cache: 'no-store', headers: { cookie: context.cookieHeader } }),
        fetch(channelMessagesUrl, { cache: 'no-store', headers: { cookie: context.cookieHeader } }),
        fetch(outboundMessagesUrl, { cache: 'no-store', headers: { cookie: context.cookieHeader } }),
      ]);
  } catch (error) {
    return (
      <AppShell session={context.session} activeMembership={context.activeMembership}>
        <ErrorPanel
          ticketId={ticketId}
          organizationLabel={context.activeMembership.organizationName}
          details={error instanceof Error ? error.message : String(error)}
        />
      </AppShell>
    );
  }

  if (
    !detailRes.ok ||
    !timelineRes.ok ||
    !approvalsRes.ok ||
    !retrievalsRes.ok ||
    !guardrailsRes.ok ||
    !conversationRes.ok ||
    !channelMessagesRes.ok ||
    !outboundMessagesRes.ok
  ) {
    const failures = await Promise.all([
      detailRes.text(),
      timelineRes.text(),
      approvalsRes.text(),
      retrievalsRes.text(),
      guardrailsRes.text(),
      conversationRes.text(),
      channelMessagesRes.text(),
      outboundMessagesRes.text(),
    ]);

    return (
      <AppShell session={context.session} activeMembership={context.activeMembership}>
        <ErrorPanel
          ticketId={ticketId}
          organizationLabel={context.activeMembership.organizationName}
          details={JSON.stringify(
            {
              detail: failures[0],
              timeline: failures[1],
              approvals: failures[2],
              retrievals: failures[3],
              guardrails: failures[4],
              conversation: failures[5],
              channelMessages: failures[6],
              outboundMessages: failures[7],
            },
            null,
            2,
          )}
        />
      </AppShell>
    );
  }

  const [
    ticket,
    timeline,
    approvals,
    retrievals,
    guardrails,
    conversation,
    channelMessages,
    outboundMessages,
  ] =
    (await Promise.all([
      detailRes.json(),
      timelineRes.json(),
      approvalsRes.json(),
      retrievalsRes.json(),
      guardrailsRes.json(),
      conversationRes.json(),
      channelMessagesRes.json(),
      outboundMessagesRes.json(),
    ])) as [
      TicketDetail,
      TimelineEvent[],
      Approval[],
      Retrieval[],
      GuardrailCheck[],
      ChannelConversation,
      ChannelMessage[],
      OutboundMessage[],
    ];

  const content = (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/tickets"
              className="text-sm font-medium text-slate-500 underline underline-offset-4"
            >
              Back to inbox
            </Link>
            <Link
              href="/settings"
              className="text-sm font-medium text-slate-500 underline underline-offset-4"
            >
              Settings
            </Link>
            <Link
              href="/knowledge"
              className="text-sm font-medium text-slate-500 underline underline-offset-4"
            >
              Knowledge
            </Link>
          </div>
          <div>
            <p className="text-sm text-slate-500">
              Org: {context.activeMembership.organizationName}
            </p>
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

          {conversation ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Channel Context
              </h2>
              <dl className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-900">Provider</dt>
                  <dd>{conversation.channel.provider}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-900">Connection</dt>
                  <dd>{conversation.channel.displayName}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-900">Customer</dt>
                  <dd>
                    {conversation.customer?.displayName ??
                      conversation.customer?.email ??
                      'Unknown'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-900">Thread</dt>
                  <dd className="break-all">
                    {conversation.externalThreadId ?? 'n/a'}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Channel Messages
            </h2>
            <div className="mt-4 space-y-3">
              {channelMessages.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No external channel messages are linked to this ticket.
                </p>
              ) : (
                channelMessages.map((message) => (
                  <article
                    key={message.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm font-medium text-slate-800">
                        {message.direction}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(message.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2 break-all text-xs text-slate-400">
                      Provider message: {message.providerMessageId ?? 'n/a'}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {message.textBody ?? message.sanitizedHtmlBody ?? '(empty message)'}
                    </p>
                    {message.attachments.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {message.attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="rounded-md bg-slate-50 p-3 text-xs text-slate-600"
                          >
                            <div className="font-medium text-slate-900">
                              {attachment.filename}
                            </div>
                            <div>
                              {attachment.mimeType} - {attachment.sizeBytes} bytes -{' '}
                              {attachment.status}
                            </div>
                            <div>Metadata only; content is not downloaded.</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Outbound Delivery
            </h2>
            <div className="mt-4 space-y-3">
              {outboundMessages.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No outbound channel messages are queued for this ticket.
                </p>
              ) : (
                outboundMessages.map((message) => (
                  <article
                    key={message.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm font-medium text-slate-800">
                        {message.status}
                      </span>
                      <span className="text-xs text-slate-400">
                        Attempts {message.attemptCount}/{message.maxAttempts}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {message.textBody}
                    </p>
                    {message.lastErrorCode ? (
                      <div className="mt-3 rounded-md bg-rose-50 p-3 text-xs text-rose-700">
                        {message.lastErrorCode}: {message.lastErrorRedacted}
                      </div>
                    ) : null}
                    {message.deliveryAttempts.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {message.deliveryAttempts.map((attempt) => (
                          <div
                            key={attempt.id}
                            className="rounded-md bg-slate-50 p-3 text-xs text-slate-600"
                          >
                            Attempt {attempt.attemptNumber}: {attempt.outcome}
                            {attempt.errorRedacted ? ` - ${attempt.errorRedacted}` : ''}
                          </div>
                        ))}
                      </div>
                    ) : null}
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
                  <DraftCard key={draft.id} draft={draft} />
                ))
              )}
            </div>
            <div className="mt-4">
              <DraftComposer ticketId={ticket.id} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Approvals</h2>
            <div className="mt-4 space-y-3">
              {approvals.length === 0 ? (
                <p className="text-sm text-slate-500">No approvals created yet.</p>
              ) : (
                approvals.map((approval) => (
                  <ApprovalReviewCard key={approval.id} approval={approval} />
                ))
              )}
            </div>
          </div>

          <TicketControls
            ticketId={ticket.id}
            status={ticket.status as 'OPEN' | 'PENDING' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'}
            priority={ticket.priority as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'}
          />
        </div>
      </section>
    </main>
  );

  return (
    <AppShell session={context.session} activeMembership={context.activeMembership}>
      {content}
    </AppShell>
  );
}
