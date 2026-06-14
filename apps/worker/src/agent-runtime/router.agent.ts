import { Injectable } from '@nestjs/common';
import { RouterOutput } from './agent-runtime.types';

@Injectable()
export class RouterAgent {
  route(input: { subject: string; body: string }): RouterOutput {
    const text = `${input.subject} ${input.body}`.toLowerCase();

    if (/(billing|invoice|payment|card)/.test(text)) {
      return {
        category: 'billing',
        intent: 'assist_billing_issue',
        urgency: /urgent|immediately|asap/.test(text) ? 'high' : 'normal',
        confidence: 0.91,
        notes: 'Matched billing-related keywords in subject/body.',
      };
    }

    if (/(login|password|account|export)/.test(text)) {
      return {
        category: 'account',
        intent: 'assist_account_request',
        urgency: /locked|cannot access|urgent/.test(text) ? 'high' : 'normal',
        confidence: 0.88,
        notes: 'Matched account-access keywords in subject/body.',
      };
    }

    if (/(bug|error|not working|api)/.test(text)) {
      return {
        category: 'technical',
        intent: 'assist_technical_issue',
        urgency: /down|broken|error/.test(text) ? 'high' : 'normal',
        confidence: 0.9,
        notes: 'Matched technical issue keywords in subject/body.',
      };
    }

    return {
      category: 'general',
      intent: 'assist_general_request',
      urgency: 'low',
      confidence: 0.76,
      notes: 'No strong routing signal; using general support path.',
    };
  }
}
