import { Injectable } from '@nestjs/common';
import {
  CriticOutput,
  ResolverOutput,
  RetrieverOutput,
} from './agent-runtime.types';

@Injectable()
export class CriticAgent {
  review(input: {
    resolver: ResolverOutput;
    retrieval: RetrieverOutput;
  }): CriticOutput {
    const draft = input.resolver.draftBody.trim();
    const issues: string[] = [];

    if (draft.length < 30) {
      issues.push('Draft body is too short.');
    }

    if (/\[todo\]|\[placeholder\]|lorem ipsum/i.test(draft)) {
      issues.push('Draft contains unsafe placeholder content.');
    }

    if (input.resolver.confidence < 0.6) {
      issues.push('Resolver confidence is below acceptable threshold.');
    }

    if (
      input.retrieval.resultCount > 0 &&
      input.resolver.usedKnowledgeArticleIds.length === 0
    ) {
      issues.push('Retrieved context was available but not used');
    }

    if (
      input.retrieval.resultCount === 0 &&
      /based on our|internal guidance|policy/i.test(draft)
    ) {
      issues.push('Draft references unsupported knowledge');
    }

    if (issues.length > 0) {
      return {
        passed: false,
        safetyVerdict: 'blocked',
        completenessScore:
          input.retrieval.resultCount > 0 &&
          input.resolver.usedKnowledgeArticleIds.length === 0
            ? 0.31
            : 0.42,
        issues,
        recommendedAction: 'revise',
      };
    }

    return {
      passed: true,
      safetyVerdict: 'safe',
      completenessScore: 0.91,
      issues: [],
      recommendedAction: 'approve',
    };
  }
}
