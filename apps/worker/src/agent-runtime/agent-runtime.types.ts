export type RouterOutput = {
  category: 'billing' | 'technical' | 'account' | 'general';
  intent: string;
  urgency: 'low' | 'normal' | 'high';
  confidence: number;
  notes: string;
};

export type RetrieverOutput = {
  query: string;
  results: Array<{
    articleId: string;
    title: string;
    snippet: string;
    score: number;
    tags: string[];
  }>;
  resultCount: number;
};

export type ResolverOutput = {
  draftBody: string;
  resolutionSummary: string;
  confidence: number;
  usedKnowledgeArticleIds: string[];
};

export type CriticOutput = {
  passed: boolean;
  safetyVerdict: 'safe' | 'needs_review' | 'blocked';
  completenessScore: number;
  issues: string[];
  recommendedAction: 'approve' | 'human_review' | 'revise';
};
