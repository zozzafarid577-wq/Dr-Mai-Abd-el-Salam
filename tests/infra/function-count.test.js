// Vercel's Hobby plan allows at most 12 Serverless Functions per deployment.
// Every *.js file directly under api/ becomes one function (files under the
// _lib/ helper directory are excluded because the name starts with "_").
// This guards against silently pushing the deployment over the limit again.
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const API_DIR = join(import.meta.dirname, '..', '..', 'api');
const VERCEL_HOBBY_LIMIT = 12;

describe('Vercel serverless function budget', () => {
  it(`keeps api/*.js at or under the ${VERCEL_HOBBY_LIMIT}-function limit`, () => {
    const fns = readdirSync(API_DIR).filter((f) => f.endsWith('.js'));
    expect(fns.length, `functions: ${fns.join(', ')}`).toBeLessThanOrEqual(VERCEL_HOBBY_LIMIT);
  });
});
