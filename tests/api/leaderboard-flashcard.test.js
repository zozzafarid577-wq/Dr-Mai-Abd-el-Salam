import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeReq, makeRes } from '../helpers/http.js';
import {
  configureSupabaseMock,
  resetSupabaseMock,
  getSupabaseCalls,
  STUDENT_USER,
} from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));

// Both actions live in the consolidated student-activity endpoint.
const { default: handler } = await import('../../api/student-activity.js');

describe('GET /api/student-activity?action=leaderboard', () => {
  beforeEach(() => {
    resetSupabaseMock();
    configureSupabaseMock({ authUser: STUDENT_USER });
  });

  it('rejects requests without a token', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET', token: null, body: {}, headers: {} }), res);
    expect(res.statusCode).toBe(401);
  });

  it('ranks rows and flags the current user', async () => {
    configureSupabaseMock({
      results: {
        'rpc.get_leaderboard': {
          data: [
            { student_id: 'other', display_name: 'A B.', points: 90 },
            { student_id: STUDENT_USER.id, display_name: 'Me M.', points: 80 },
          ],
          error: null,
        },
      },
    });
    const res = makeRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, query: { action: 'leaderboard' }, body: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.leaderboard[0]).toMatchObject({ rank: 1, is_me: false });
    expect(res.body.leaderboard[1]).toMatchObject({ rank: 2, is_me: true });
    expect(res.body.me.student_id).toBe(STUDENT_USER.id);
  });

  it('passes window_days=0 when window is "all"', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { action: 'leaderboard', window: 'all' } }), res);
    const [call] = getSupabaseCalls('rpc.get_leaderboard');
    expect(call.args.window_days).toBe(0);
  });

  it('defaults to a 7-day window', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { action: 'leaderboard' } }), res);
    const [call] = getSupabaseCalls('rpc.get_leaderboard');
    expect(call.args.window_days).toBe(7);
  });
});

describe('POST /api/student-activity (action: flashcard-review)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    configureSupabaseMock({ authUser: STUDENT_USER });
  });

  it('requires question_id and a boolean correct', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { action: 'flashcard-review', question_id: 'q1' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('promotes the card and upserts progress scoped to the student', async () => {
    configureSupabaseMock({
      results: {
        'flashcard_progress.select': { data: { box: 2, reviews: 3, correct: 2 }, error: null },
        'flashcard_progress.upsert': (call) => ({ data: { ...call.payload }, error: null }),
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'flashcard-review', question_id: 'q1', correct: true } }), res);

    expect(res.statusCode).toBe(200);
    const [upsert] = getSupabaseCalls('flashcard_progress.upsert');
    expect(upsert.payload).toMatchObject({
      student_id: STUDENT_USER.id,
      question_id: 'q1',
      box: 3,
      reviews: 4,
      correct: 3,
    });
    expect(upsert.opts).toEqual({ onConflict: 'student_id,question_id' });
  });

  it('resets the card to box 1 on a wrong answer', async () => {
    configureSupabaseMock({
      results: {
        'flashcard_progress.select': { data: { box: 4, reviews: 9, correct: 7 }, error: null },
        'flashcard_progress.upsert': (call) => ({ data: { ...call.payload }, error: null }),
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'flashcard-review', question_id: 'q1', correct: false } }), res);

    const [upsert] = getSupabaseCalls('flashcard_progress.upsert');
    expect(upsert.payload.box).toBe(1);
    expect(upsert.payload.correct).toBe(7);
  });
});

describe('POST /api/student-activity (unknown action)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    configureSupabaseMock({ authUser: STUDENT_USER });
  });

  it('400s on a missing/unknown action', async () => {
    const res = makeRes();
    await handler(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
  });
});
