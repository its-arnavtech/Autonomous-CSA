'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type KnowledgeArticle = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  updatedAt: string;
};

type KnowledgeManagerProps = {
  initialArticles: KnowledgeArticle[];
  initialQuery?: string;
  initialStatus?: string;
};

function statusTone(status: KnowledgeArticle['status']) {
  switch (status) {
    case 'PUBLISHED':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'ARCHIVED':
      return 'bg-zinc-100 text-zinc-700 ring-zinc-200';
    default:
      return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
}

export function KnowledgeManager({
  initialArticles,
  initialQuery = '',
  initialStatus = '',
}: KnowledgeManagerProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<KnowledgeArticle['status']>('DRAFT');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshWithFilters = (nextQuery = query, nextStatus = statusFilter) => {
    const params = new URLSearchParams();
    if (nextQuery.trim()) {
      params.set('q', nextQuery.trim());
    }
    if (nextStatus) {
      params.set('status', nextStatus);
    }

    router.push(`/knowledge?${params.toString()}`);
    router.refresh();
  };

  const createArticle = () => {
    setMessage(null);
    setError(null);

    startTransition(() => {
      void (async () => {
        const res = await fetch('/api/knowledge/articles', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title,
            body,
            tags: tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
            status,
          }),
        });

        if (!res.ok) {
          setError((await res.text()) || 'Failed to create article.');
          return;
        }

        setTitle('');
        setBody('');
        setTags('');
        setStatus('DRAFT');
        setMessage('Knowledge article created.');
        router.refresh();
      })();
    });
  };

  const updateArticle = (article: KnowledgeArticle) => {
    setMessage(null);
    setError(null);

    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/knowledge/articles/${encodeURIComponent(article.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: article.title,
            body: article.body,
            tags: article.tags,
            status: article.status,
          }),
        });

        if (!res.ok) {
          setError((await res.text()) || 'Failed to update article.');
          return;
        }

        setMessage(`Updated "${article.title}".`);
        router.refresh();
      })();
    });
  };

  const archiveArticle = (articleId: string) => {
    setMessage(null);
    setError(null);

    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/knowledge/articles/${encodeURIComponent(articleId)}`, {
          method: 'DELETE',
        });

        if (!res.ok) {
          setError((await res.text()) || 'Failed to archive article.');
          return;
        }

        setMessage('Knowledge article archived.');
        router.refresh();
      })();
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create Knowledge Article</h2>

        <div className="mt-5 grid gap-4">
          <input
            className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
            placeholder="Article title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isPending}
          />
          <textarea
            className="min-h-36 rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
            placeholder="Article body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={isPending}
          />
          <input
            className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
            placeholder="Tags (comma separated)"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            disabled={isPending}
          />
          <select
            className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
            value={status}
            onChange={(event) => setStatus(event.target.value as KnowledgeArticle['status'])}
            disabled={isPending}
          >
            <option value="DRAFT">DRAFT</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={createArticle}
              disabled={isPending || title.trim().length === 0 || body.trim().length === 0}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPending ? 'Saving...' : 'Create Article'}
            </button>
            {message ? <span className="text-sm text-emerald-700">{message}</span> : null}
            {error ? <span className="text-sm text-rose-700">{error}</span> : null}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Knowledge Articles</h2>
            <p className="mt-1 text-sm text-slate-500">
              Deterministic retrieval sources for the support runtime.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder="Search title, body, or tags"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={isPending}
            />
            <select
              className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              disabled={isPending}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
            <button
              type="button"
              onClick={() => refreshWithFilters()}
              disabled={isPending}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Apply Filters
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {initialArticles.length === 0 ? (
            <p className="text-sm text-slate-500">No knowledge articles found for this filter.</p>
          ) : (
            initialArticles.map((article) => (
              <KnowledgeArticleCard
                key={article.id}
                article={article}
                isPending={isPending}
                onSave={updateArticle}
                onArchive={archiveArticle}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function KnowledgeArticleCard({
  article,
  isPending,
  onSave,
  onArchive,
}: {
  article: KnowledgeArticle;
  isPending: boolean;
  onSave: (article: KnowledgeArticle) => void;
  onArchive: (articleId: string) => void;
}) {
  const [draft, setDraft] = useState(article);

  return (
    <article className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="font-medium text-slate-900">{article.title}</div>
          <div className="mt-1 text-xs text-slate-400">
            Updated {new Date(article.updatedAt).toLocaleString()}
          </div>
        </div>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusTone(draft.status)}`}
        >
          {draft.status}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        <input
          className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          disabled={isPending}
        />
        <textarea
          className="min-h-28 rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          value={draft.body}
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
          disabled={isPending}
        />
        <input
          className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          value={draft.tags.join(', ')}
          onChange={(event) =>
            setDraft({
              ...draft,
              tags: event.target.value
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            })
          }
          disabled={isPending}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
            value={draft.status}
            onChange={(event) =>
              setDraft({
                ...draft,
                status: event.target.value as KnowledgeArticle['status'],
              })
            }
            disabled={isPending}
          >
            <option value="DRAFT">DRAFT</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={isPending}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Save Article
          </button>
          <button
            type="button"
            onClick={() => onArchive(article.id)}
            disabled={isPending || draft.status === 'ARCHIVED'}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Archive
          </button>
        </div>
      </div>
    </article>
  );
}
