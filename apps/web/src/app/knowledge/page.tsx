import { AppShell } from '../_auth/app-shell';
import { OrganizationSelection } from '../_auth/organization-selection';
import { requireSessionForPage } from '../_auth/server-auth';
import { KnowledgeManager } from './knowledge-manager';

type KnowledgeArticle = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  updatedAt: string;
};

type KnowledgePageProps = {
  searchParams:
    | { q?: string; status?: string }
    | Promise<{ q?: string; status?: string }>;
};

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
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

  const resolvedSearchParams = await searchParams;
  const q = resolvedSearchParams.q ?? '';
  const status = resolvedSearchParams.status ?? '';
  const articlesUrl = new URL(`${context.baseUrl}/api/knowledge/articles`);
  if (q) {
    articlesUrl.searchParams.set('q', q);
  }
  if (status) {
    articlesUrl.searchParams.set('status', status);
  }

  const response = await fetch(articlesUrl.toString(), {
    cache: 'no-store',
    headers: { cookie: context.cookieHeader },
  });

  let content: React.ReactNode;
  if (!response.ok) {
    const detail = await response.text();
    content = (
      <main className="mx-auto max-w-5xl space-y-4 px-6 py-8">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/15 p-5">
          <h2 className="text-2xl font-semibold text-rose-200">
            Failed to load knowledge articles
          </h2>
          <pre className="mt-3 overflow-auto rounded-xl bg-ink-850/80 p-3 text-xs text-mist-100">
            {detail}
          </pre>
        </div>
      </main>
    );
  } else {
    const articles = (await response.json()) as KnowledgeArticle[];
    content = (
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-mist-50">
            Knowledge Base
          </h2>
          <p className="mt-1 text-sm text-mist-400">
            Manage deterministic internal support articles for{' '}
            {context.activeMembership.organizationName}.
          </p>
        </div>

        <KnowledgeManager
          initialArticles={articles}
          initialQuery={q}
          initialStatus={status}
        />
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
