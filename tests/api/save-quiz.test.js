import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeReq, makeRes } from '../helpers/http.js';
import {
  configureSupabaseMock,
  resetSupabaseMock,
  getSupabaseCalls,
  STUDENT_USER,
} from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));

const { default: handler } = await import('../../api/save-quiz.js');

const questions = [
  { question_text: 'Q1', options: ['a', 'b', 'c'], correct_index: 2 },
  { question_text: 'Q2', options: ['a', 'b'], correct_index: 0, explanation: 'because' },
];

describe('POST /api/save-quiz', () => {
  beforeEach(() => resetSupabaseMock());

  it('rejects non-admin callers', async () => {
    configureSupabaseMock({ authUser: STUDENT_USER });
    const res = makeRes();
    await handler(makeReq({ body: { title: 'T', course_id: 'c1', questions } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('requires title, course_id and a non-empty questions array', async () => {
    for (const body of [
      { course_id: 'c1', questions },
      { title: 'T', questions },
      { title: 'T', course_id: 'c1', questions: [] },
      { title: 'T', course_id: 'c1' },
    ]) {
      const res = makeRes();
      await handler(makeReq({ body }), res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('creates a new test and inserts ordered question rows', async () => {
    configureSupabaseMock({
      results: { 'practice_tests.insert': { data: { id: 'test-1' }, error: null } },
    });
    const res = makeRes();
    await handler(
      makeReq({ body: { title: 'Quiz 1', course_id: 'c1', is_mock: true, time_limit_min: '30', questions } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ test_id: 'test-1', questions_saved: 2, is_mock: true });

    const [testInsert] = getSupabaseCalls('practice_tests.insert');
    expect(testInsert.payload).toMatchObject({
      title: 'Quiz 1',
      course_id: 'c1',
      is_mock: true,
      is_active: true,
      time_limit_min: 30,
    });

    const [qInsert] = getSupabaseCalls('test_questions.insert');
    expect(qInsert.payload).toHaveLength(2);
    expect(qInsert.payload[0]).toMatchObject({
      test_id: 'test-1',
      question_text: 'Q1',
      correct_index: 2,
      order_index: 0,
      points: 1,
    });
    expect(qInsert.payload[1].order_index).toBe(1);
  });

  it('updates an existing test and replaces its questions when test_id is given', async () => {
    configureSupabaseMock({
      results: { 'practice_tests.update': { data: { id: 'test-9' }, error: null } },
    });
    const res = makeRes();
    await handler(
      makeReq({ body: { test_id: 'test-9', title: 'Renamed', course_id: 'c1', questions } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.test_id).toBe('test-9');

    const [qDelete] = getSupabaseCalls('test_questions.delete');
    expect(qDelete.filters.test_id).toBe('test-9');

    const [qInsert] = getSupabaseCalls('test_questions.insert');
    expect(qInsert.payload.every((r) => r.test_id === 'test-9')).toBe(true);
  });

  it('rolls back a newly created test when question insert fails', async () => {
    configureSupabaseMock({
      results: {
        'practice_tests.insert': { data: { id: 'test-1' }, error: null },
        'test_questions.insert': { data: null, error: { message: 'constraint violation' } },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { title: 'T', course_id: 'c1', questions } }), res);

    expect(res.statusCode).toBe(500);
    const [testDelete] = getSupabaseCalls('practice_tests.delete');
    expect(testDelete.filters.id).toBe('test-1');
  });

  it('coerces malformed question fields instead of crashing', async () => {
    configureSupabaseMock({
      results: { 'practice_tests.insert': { data: { id: 'test-1' }, error: null } },
    });
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          title: 'T',
          course_id: 'c1',
          questions: [{ question_text: 42, options: 'not-an-array', correct_index: '2' }],
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const [qInsert] = getSupabaseCalls('test_questions.insert');
    expect(qInsert.payload[0]).toMatchObject({
      question_text: '42',
      options: [],
      correct_index: 0,
    });
  });
});
