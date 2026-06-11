import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeReq, makeRes } from '../helpers/http.js';
import {
  configureSupabaseMock,
  resetSupabaseMock,
  STUDENT_USER,
} from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));

// Mock the Anthropic SDK so generate-questions runs without a real API key/call.
const createMessage = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() {
      this.messages = { create: createMessage };
    }
  },
}));

const { default: generate } = await import('../../api/generate-questions.js');
const { default: importText } = await import('../../api/import-questions-text.js');

describe('POST /api/import-questions-text', () => {
  beforeEach(() => resetSupabaseMock());

  it('rejects non-admins', async () => {
    configureSupabaseMock({ authUser: STUDENT_USER });
    const res = makeRes();
    await importText(makeReq({ body: { text: 'x' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('requires text', async () => {
    const res = makeRes();
    await importText(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('parses pasted questions and returns them', async () => {
    const res = makeRes();
    await importText(
      makeReq({
        body: {
          text: `1. Powerhouse of the cell?\nA) Nucleus\nB) Mitochondrion\nAnswer: B`,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.parsed).toBe(1);
    expect(res.body.questions[0].correct_index).toBe(1);
  });

  it('returns 422 when nothing parses', async () => {
    const res = makeRes();
    await importText(makeReq({ body: { text: 'just some prose with no options' } }), res);
    expect(res.statusCode).toBe(422);
  });
});

describe('POST /api/generate-questions', () => {
  beforeEach(() => {
    resetSupabaseMock();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    createMessage.mockReset();
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('rejects non-admins', async () => {
    configureSupabaseMock({ authUser: STUDENT_USER });
    const res = makeRes();
    await generate(makeReq({ body: { topic: 'cells' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('requires a topic', async () => {
    const res = makeRes();
    await generate(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('500s when no API key is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = makeRes();
    await generate(makeReq({ body: { topic: 'cells' } }), res);
    expect(res.statusCode).toBe(500);
  });

  it('returns normalized questions from the model output', async () => {
    createMessage.mockResolvedValue({
      content: [{
        text: '```json\n[{"question_text":"Q1","options":["a","b","c","d"],"correct_index":2,"explanation":"because"}]\n```',
      }],
    });
    const res = makeRes();
    await generate(makeReq({ body: { topic: 'photosynthesis', count: 3, difficulty: 'hard' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0]).toMatchObject({ question_text: 'Q1', correct_index: 2 });
  });

  it('clamps the requested count into the 1..20 range', async () => {
    createMessage.mockResolvedValue({ content: [{ text: '[{"question_text":"Q","options":["a","b"],"correct_index":0}]' }] });
    const res = makeRes();
    await generate(makeReq({ body: { topic: 't', count: 999 } }), res);

    const prompt = createMessage.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Number of questions: 20');
  });

  it('422s when the model returns unusable JSON', async () => {
    createMessage.mockResolvedValue({ content: [{ text: 'sorry, no' }] });
    const res = makeRes();
    await generate(makeReq({ body: { topic: 't' } }), res);
    expect(res.statusCode).toBe(422);
  });
});
