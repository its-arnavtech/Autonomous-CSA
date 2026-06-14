type Retrieval = {
  id: string;
  query: string;
  resultCount: number;
  resultsJson: unknown;
  createdAt: string;
};

type AgentStep = {
  id: string;
  stepType: string;
  outputJson?: unknown;
};

function extractUsedKnowledgeIds(steps: AgentStep[]) {
  return steps
    .filter((step) => step.stepType === 'RESOLVER')
    .flatMap((step) => {
      if (
        typeof step.outputJson === 'object' &&
        step.outputJson !== null &&
        'usedKnowledgeArticleIds' in step.outputJson &&
        Array.isArray(step.outputJson.usedKnowledgeArticleIds)
      ) {
        return step.outputJson.usedKnowledgeArticleIds.filter(
          (value): value is string => typeof value === 'string',
        );
      }

      return [];
    });
}

export function KnowledgeRetrievalPanel({
  retrievals,
  steps,
}: {
  retrievals: Retrieval[];
  steps: AgentStep[];
}) {
  const usedKnowledgeIds = new Set(extractUsedKnowledgeIds(steps));

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Knowledge Retrieval</h2>
      <div className="mt-4 space-y-3">
        {retrievals.length === 0 ? (
          <p className="text-sm text-slate-500">No knowledge retrievals recorded yet.</p>
        ) : (
          retrievals.map((retrieval) => {
            const results = Array.isArray(retrieval.resultsJson)
              ? retrieval.resultsJson
              : [];

            return (
              <article key={retrieval.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{retrieval.query}</div>
                    <div className="text-sm text-slate-500">
                      {retrieval.resultCount} result
                      {retrieval.resultCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    {new Date(retrieval.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  {results.length === 0 ? (
                    <p className="text-sm text-slate-500">No published knowledge matches.</p>
                  ) : (
                    results.map((result) => {
                      if (typeof result !== 'object' || result === null) {
                        return null;
                      }

                      const articleId =
                        typeof result.articleId === 'string'
                          ? result.articleId
                          : 'unknown';
                      const title =
                        typeof result.title === 'string'
                          ? result.title
                          : 'Untitled article';
                      const snippet =
                        typeof result.snippet === 'string' ? result.snippet : '';
                      const score =
                        typeof result.score === 'number'
                          ? result.score
                          : null;

                      return (
                        <div key={articleId} className="rounded-2xl bg-slate-50 p-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="font-medium text-slate-900">{title}</div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              {score !== null ? <span>Score {score}</span> : null}
                              {usedKnowledgeIds.has(articleId) ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                                  Used by resolver
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {snippet ? (
                            <p className="mt-2 text-sm leading-6 text-slate-600">{snippet}</p>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
