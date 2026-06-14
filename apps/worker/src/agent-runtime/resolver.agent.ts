import { Injectable } from '@nestjs/common';
import {
  ResolverOutput,
  RetrieverOutput,
  RouterOutput,
} from './agent-runtime.types';

@Injectable()
export class ResolverAgent {
  resolve(input: {
    subject: string;
    body: string;
    router: RouterOutput;
    retrieval: RetrieverOutput;
  }): ResolverOutput {
    const templates: Record<RouterOutput['category'], string> = {
      billing:
        'Thanks for reaching out about your billing request. We are reviewing the payment details you mentioned and will follow up with the next steps shortly.',
      technical:
        'Thanks for flagging this technical issue. We are reviewing the behavior you described and will follow up with troubleshooting guidance shortly.',
      account:
        'Thanks for contacting us about your account request. We are reviewing the access details you shared and will follow up with the next steps shortly.',
      general:
        'Thanks for reaching out. We are reviewing your request and will follow up with an update shortly.',
    };

    const topResult = input.retrieval.results[0];
    if (topResult) {
      const categoryOpeners: Record<RouterOutput['category'], string> = {
        billing: 'Thanks for reaching out about your billing request.',
        technical: 'Thanks for flagging this technical issue.',
        account: 'Thanks for contacting us about your account request.',
        general: 'Thanks for reaching out.',
      };

      return {
        draftBody: `${categoryOpeners[input.router.category]} Based on our ${topResult.title.toLowerCase()}, the recommended next step is to confirm the relevant details you shared so we can review the records accurately. We will verify the information against our internal guidance and follow up with the next support action shortly.`,
        resolutionSummary: `Prepared a ${input.router.category} response using knowledge article ${topResult.articleId}.`,
        confidence: Math.min(0.98, input.router.confidence + 0.05),
        usedKnowledgeArticleIds: [topResult.articleId],
      };
    }

    return {
      draftBody: templates[input.router.category],
      resolutionSummary: `Prepared a ${input.router.category} response for intent ${input.router.intent}.`,
      confidence: Math.min(0.95, input.router.confidence + 0.03),
      usedKnowledgeArticleIds: [],
    };
  }
}
