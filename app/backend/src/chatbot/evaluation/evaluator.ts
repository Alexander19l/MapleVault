import type { NLPResult } from '../types';
import { ChatbotEvaluationFixture } from './fixtures';

export interface ChatbotEvaluationCaseResult {
  id: string;
  prompt: string;
  category: ChatbotEvaluationFixture['category'];
  passed: boolean;
  expectedIntent: string;
  actualIntent: string;
  errors: string[];
}

export interface ChatbotEvaluationReport {
  total: number;
  passed: number;
  failed: ChatbotEvaluationCaseResult[];
  results: ChatbotEvaluationCaseResult[];
}

type Parser = (prompt: string) => NLPResult | Promise<NLPResult>;

function normalizeComparable(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

function entityMatches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    const actualItems = Array.isArray(actual)
      ? actual
      : String(actual || '').split(',').map(value => value.trim()).filter(Boolean);
    return expected.every(expectedItem => actualItems.map(normalizeComparable).includes(normalizeComparable(expectedItem)));
  }

  if (typeof expected === 'number') return actual === expected;
  return normalizeComparable(actual) === normalizeComparable(expected);
}

function hasForbiddenEntity(result: NLPResult, entity: string): boolean {
  const value = (result.entities as any)[entity];
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '';
}

export function evaluateParsedIntent(fixture: ChatbotEvaluationFixture, result: NLPResult): ChatbotEvaluationCaseResult {
  const errors: string[] = [];

  if (result.intent !== fixture.expectedIntent) {
    errors.push(`intent esperado ${fixture.expectedIntent}, recibido ${result.intent}`);
  }

  for (const [entity, expectedValue] of Object.entries(fixture.expectedEntities || {})) {
    const actualValue = (result.entities as any)[entity];
    if (!entityMatches(actualValue, expectedValue)) {
      errors.push(`entidad ${entity} esperada ${JSON.stringify(expectedValue)}, recibida ${JSON.stringify(actualValue)}`);
    }
  }

  for (const entity of fixture.forbiddenEntities || []) {
    if (hasForbiddenEntity(result, entity)) {
      errors.push(`entidad prohibida ${entity} presente con valor ${JSON.stringify((result.entities as any)[entity])}`);
    }
  }

  return {
    id: fixture.id,
    prompt: fixture.prompt,
    category: fixture.category,
    passed: errors.length === 0,
    expectedIntent: fixture.expectedIntent,
    actualIntent: result.intent,
    errors
  };
}

export async function evaluateChatbotFixtures(
  fixtures: ChatbotEvaluationFixture[],
  parser: Parser
): Promise<ChatbotEvaluationReport> {
  const results: ChatbotEvaluationCaseResult[] = [];

  for (const fixture of fixtures) {
    const parsed = await parser(fixture.prompt);
    results.push(evaluateParsedIntent(fixture, parsed));
  }

  const failed = results.filter(result => !result.passed);

  return {
    total: results.length,
    passed: results.length - failed.length,
    failed,
    results
  };
}
