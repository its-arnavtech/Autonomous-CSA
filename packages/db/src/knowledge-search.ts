export type KnowledgeSearchArticle = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: Date;
};

export type KnowledgeSearchResult = {
  articleId: string;
  title: string;
  snippet: string;
  score: number;
  tags: string[];
};

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function countTokenMatches(tokens: string[], haystackTokens: string[]) {
  if (tokens.length === 0 || haystackTokens.length === 0) {
    return 0;
  }

  const haystackCounts = new Map<string, number>();
  for (const token of haystackTokens) {
    haystackCounts.set(token, (haystackCounts.get(token) ?? 0) + 1);
  }

  return tokens.reduce((total, token) => total + (haystackCounts.get(token) ?? 0), 0);
}

function buildSnippet(body: string, tokens: string[]) {
  const normalizedBody = body.replace(/\s+/g, ' ').trim();
  if (!normalizedBody) {
    return '';
  }

  const lowercaseBody = normalizedBody.toLowerCase();
  const firstMatchIndex = tokens
    .map((token) => lowercaseBody.indexOf(token))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  if (firstMatchIndex === undefined) {
    return normalizedBody.slice(0, 180);
  }

  const start = Math.max(0, firstMatchIndex - 60);
  const end = Math.min(normalizedBody.length, firstMatchIndex + 140);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalizedBody.length ? '...' : '';

  return `${prefix}${normalizedBody.slice(start, end)}${suffix}`;
}

export function rankKnowledgeArticles(params: {
  articles: KnowledgeSearchArticle[];
  query: string;
  limit?: number;
}) {
  const tokens = tokenize(params.query);
  const limit = params.limit ?? 5;

  if (tokens.length === 0) {
    return [] satisfies KnowledgeSearchResult[];
  }

  const results = params.articles
    .map((article) => {
      const titleTokens = tokenize(article.title);
      const bodyTokens = tokenize(article.body);
      const tagTokens = article.tags.flatMap((tag) => tokenize(tag));

      const titleScore = countTokenMatches(tokens, titleTokens) * 10;
      const tagScore = countTokenMatches(tokens, tagTokens) * 6;
      const bodyScore = countTokenMatches(tokens, bodyTokens) * 2;
      const score = titleScore + tagScore + bodyScore;

      if (score <= 0) {
        return null;
      }

      return {
        articleId: article.id,
        title: article.title,
        snippet: buildSnippet(article.body, tokens),
        score,
        tags: article.tags,
        updatedAt: article.updatedAt,
      };
    })
    .filter((result): result is KnowledgeSearchResult & { updatedAt: Date } => result !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.updatedAt.getTime() - left.updatedAt.getTime();
    })
    .slice(0, limit)
    .map(({ updatedAt: _updatedAt, ...result }) => result);

  return results;
}

export function buildKnowledgeSearchQuery(parts: string[]) {
  return parts
    .flatMap((part) => tokenize(part))
    .filter((token, index, tokens) => tokens.indexOf(token) === index)
    .join(' ');
}
