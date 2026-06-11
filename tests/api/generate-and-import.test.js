import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeReq, makeRes } from '../helpers/http.js';
import {
  configureSupabaseMock,
  resetSupabaseMock,
  STUDENT_USER,
} from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));

// Mock the Anthropic SDK so the generate action runs without a real key/call.
const createMessage = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() {
      this.messages = { create: createMessage };
    }
  },
}));

// Both actions live in the consolidated question-tools endpoint.
const { default: handler } = await import('../../api/question-tools.js');

describe('POST /api/question-tools (action: parse-text)', () => {
  beforeEach(() => resetSupabaseMock());

  it('rejects non-admins', async () => {
    configureSupabaseMock({ authUser: STUDENT_USER });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'parse-text', text: 'x' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('requires text', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { action: 'parse-text' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('parses pasted questions and returns them', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          action: 'parse-text',
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
    await handler(makeReq({ body: { action: 'parse-text', text: 'just some prose with no options' } }), res);
    expect(res.statusCode).toBe(422);
  });
});

describe('POST /api/question-tools (action: generate)', () => {
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
    await handler(makeReq({ body: { action: 'generate', topic: 'cells' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('requires a topic', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { action: 'generate' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('500s when no API key is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = makeRes();
    await handler(makeReq({ body: { action: 'generate', topic: 'cells' } }), res);
    expect(res.statusCode).toBe(500);
  });

  it('returns normalized questions from the model output', async () => {
    createMessage.mockResolvedValue({
      content: [{
        text: '```json\n[{"question_text":"Q1","options":["a","b","c","d"],"correct_index":2,"explanation":"because"}]\n```',
      }],
    });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'generate', topic: 'photosynthesis', count: 3, difficulty: 'hard' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0]).toMatchObject({ question_text: 'Q1', correct_index: 2 });
  });

  it('clamps the requested count into the 1..20 range', async () => {
    createMessage.mockResolvedValue({ content: [{ text: '[{"question_text":"Q","options":["a","b"],"correct_index":0}]' }] });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'generate', topic: 't', count: 999 } }), res);

    const prompt = createMessage.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Number of questions: 20');
  });

  it('422s when the model returns unusable JSON', async () => {
    createMessage.mockResolvedValue({ content: [{ text: 'sorry, no' }] });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'generate', topic: 't' } }), res);
    expect(res.statusCode).toBe(422);
  });
});

describe('POST /api/question-tools (unknown action)', () => {
  beforeEach(() => resetSupabaseMock());

  it('400s on a missing/unknown action', async () => {
    const res = makeRes();
    await handler(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
  });
});
