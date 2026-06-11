import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeReq, makeRes } from '../helpers/http.js';
import {
  configureSupabaseMock,
  resetSupabaseMock,
  getSupabaseCalls,
  STUDENT_USER,
} from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));

const { default: saveQuestion } = await import('../../api/save-bank-question.js');
const { default: deleteQuestion } = await import('../../api/delete-bank-question.js');

describe('POST /api/save-bank-question', () => {
  beforeEach(() => resetSupabaseMock());

  it('rejects non-admin callers', async () => {
    configureSupabaseMock({ authUser: STUDENT_USER });
    const res = makeRes();
    await saveQuestion(makeReq({ body: { question_text: 'Q', question_type: 'mcq' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('requires question_text and question_type', async () => {
    const res1 = makeRes();
    await saveQuestion(makeReq({ body: { question_type: 'mcq' } }), res1);
    expect(res1.statusCode).toBe(400);

    const res2 = makeRes();
    await saveQuestion(makeReq({ body: { question_text: '   ' } }), res2);
    expect(res2.statusCode).toBe(400);
  });

  it('inserts a new question with defaults applied', async () => {
    configureSupabaseMock({
      results: { 'question_bank.insert': { data: { id: 'q1' }, error: null } },
    });
    const res = makeRes();
    await saveQuestion(
      makeReq({
        body: {
          question_text: '  What is DNA?  ',
          question_type: 'mcq',
          options: ['A', 'B'],
          correct_index: 1,
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const [insert] = getSupabaseCalls('question_bank.insert');
    expect(insert.payload).toMatchObject({
      question_text: 'What is DNA?',
      question_type: 'mcq',
      difficulty: 'medium',
      status: 'published',
      options: ['A', 'B'],
      correct_index: 1,
    });
  });

  it('stores null (not 0) when correct_index is not an integer', async () => {
    configureSupabaseMock({
      results: { 'question_bank.insert': { data: { id: 'q1' }, error: null } },
    });
    const res = makeRes();
    await saveQuestion(
      makeReq({ body: { question_text: 'Q', question_type: 'written', correct_answer: 'mitochondria' } }),
      res
    );

    const [insert] = getSupabaseCalls('question_bank.insert');
    expect(insert.payload.correct_index).toBeNull();
    expect(insert.payload.correct_answer).toBe('mitochondria');
  });

  it('updates the existing row when id is provided', async () => {
    configureSupabaseMock({
      results: { 'question_bank.update': { data: { id: 'q9' }, error: null } },
    });
    const res = makeRes();
    await saveQuestion(
      makeReq({ body: { id: 'q9', question_text: 'Updated', question_type: 'mcq' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(getSupabaseCalls('question_bank.insert')).toHaveLength(0);
    const [update] = getSupabaseCalls('question_bank.update');
    expect(update.filters.id).toBe('q9');
    expect(update.payload.question_text).toBe('Updated');
  });
});

describe('DELETE /api/delete-bank-question', () => {
  beforeEach(() => resetSupabaseMock());

  it('only accepts DELETE', async () => {
    const res = makeRes();
    await deleteQuestion(makeReq({ method: 'POST', body: { id: 'q1' } }), res);
    expect(res.statusCode).toBe(405);
  });

  it('requires id', async () => {
    const res = makeRes();
    await deleteQuestion(makeReq({ method: 'DELETE', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('deletes the question by id', async () => {
    const res = makeRes();
    await deleteQuestion(makeReq({ method: 'DELETE', body: { id: 'q1' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: 'q1' });
    const [del] = getSupabaseCalls('question_bank.delete');
    expect(del.filters.id).toBe('q1');
  });
});
