import { expect, it } from 'vitest';
import { exerciseCoverage } from '../test/coverage';

it('authors every additional rule, every freshness mode and adapter/transform combination using controls', async () => {
  const documents: unknown[] = [];
  await exerciseCoverage(async (document) => { documents.push(document); });
  expect(documents).toHaveLength(31);
}, 120_000);
