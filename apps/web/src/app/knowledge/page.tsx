import Link from 'next/link';
import { headers } from 'next/headers';
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
    | { orgId?: string; q?: string; status?: string }
    | Promise<{ orgId?: string; q?: string; status?: string }>;
};

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const resolvedSearchParams = await searchParams;
  const orgId = resolvedSearchParams.orgId ?? 'org_demo';
  const q = resolvedSearchParams.q ?? '';
  const status = resolvedSearchParams.status ?? '';
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const base = `${proto}://${host}`;
  const articlesUrl = new URL(`${base}/api/knowledge/articles`);
  articlesUrl.searchParams.set('orgId', orgId);
  if (q) {
    articlesUrl.searchParams.set('q', q);
  }
  if (status) {
    articlesUrl.searchParams.set('status', status);
  }

  const res = await fetch(articlesUrl.toString(), { cache: 'no-store' });

  if (!res.ok) {
    const detail = await res.text();

    return (
      <main className="mx-auto max-w-5xl space-y-4 px-6 py-8">
        <Link
          href={`/tickets?orgId=${encodeURIComponent(orgId)}`}
          className="text-sm font-medium text-slate-500 underline underline-offset-4"
        >
          Back to inbox
        </Link>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h1 className="text-2xl font-semibold text-rose-800">
            Failed to load knowledge articles
          </h1>
          <pre className="mt-3 overflow-auto rounded-xl bg-white/80 p-3 text-xs text-slate-800">
            {detail}
          </pre>
        </div>
      </main>
    );
  }

  const articles = (await res.json()) as KnowledgeArticle[];

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
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
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Knowledge Base
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage deterministic internal support articles for {orgId}.
          </p>
        </div>
      </div>

      <KnowledgeManager
        orgId={orgId}
        initialArticles={articles}
        initialQuery={q}
        initialStatus={status}
      />
    </main>
  );
}
