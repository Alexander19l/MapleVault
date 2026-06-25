import { describe, expect, it } from 'vitest';
import { parseIntentRegex } from '../nlpEngine';
import { evaluateChatbotFixtures } from '../evaluation/evaluator';
import { CHATBOT_EVALUATION_FIXTURES } from '../evaluation/fixtures';

describe('chatbot/evaluation', () => {
  it('mantiene estable la matriz de prompts criticos del chatbot', async () => {
    const report = await evaluateChatbotFixtures(CHATBOT_EVALUATION_FIXTURES, parseIntentRegex);

    expect(report.total).toBe(CHATBOT_EVALUATION_FIXTURES.length);
    expect(report.failed).toEqual([]);
    expect(report.passed).toBe(report.total);
  });
});
