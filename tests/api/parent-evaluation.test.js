import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeReq, makeRes } from '../helpers/http.js';
import {
  configureSupabaseMock,
  resetSupabaseMock,
  ADMIN_USER,
  STUDENT_USER,
} from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));

const { default: handler } = await import('../../api/send-parent-result.js');

function mockBrevoOk() {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ messageId: 'm1' }) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('POST /api/send-parent-result (action: evaluation)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    process.env.BREVO_API_KEY = 'xkeysib-test';
  });
  afterEach(() => {
    delete process.env.BREVO_API_KEY;
    vi.unstubAllGlobals();
  });

  it('rejects non-admins', async () => {
    configureSupabaseMock({ authUser: STUDENT_USER, results: { 'profiles.select': { data: { role: 'student' }, error: null } } });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'evaluation', student_id: 's1' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('requires student_id or all', async () => {
    configureSupabaseMock({ authUser: ADMIN_USER });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'evaluation' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('emails one parent a progress summary', async () => {
    const fetchMock = mockBrevoOk();
    configureSupabaseMock({
      authUser: ADMIN_USER,
      results: {
        'profiles.select': { data: { id: 's1', full_name: 'Omar Ali', parent_email: 'p@x.com' }, error: null },
        'test_attempts.select': { data: [
          { percentage: 80, passed: true,  completed_at: '2026-01-02', practice_tests: { title: 'Quiz 1' } },
          { percentage: 60, passed: false, completed_at: '2026-01-01', practice_tests: { title: 'Quiz 2' } },
        ], error: null },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'evaluation', student_id: 's1' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ sent: 1, skipped: 0, failed: 0 });
    const [, opts] = fetchMock.mock.calls[0];
    const payload = JSON.parse(opts.body);
    expect(payload.to[0].email).toBe('p@x.com');
    expect(payload.subject).toContain('Omar Ali');
    expect(payload.htmlContent).toContain('Quiz 1'); // recent results table
  });

  it('skips a student with no parent email', async () => {
    const fetchMock = mockBrevoOk();
    configureSupabaseMock({
      authUser: ADMIN_USER,
      results: { 'profiles.select': { data: { id: 's1', full_name: 'No Parent', parent_email: null }, error: null } },
    });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'evaluation', student_id: 's1' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ sent: 0, skipped: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bulk-sends to all students with a parent email', async () => {
    const fetchMock = mockBrevoOk();
    configureSupabaseMock({
      authUser: ADMIN_USER,
      results: {
        'profiles.select': { data: [
          { id: 's1', full_name: 'A', parent_email: 'a@x.com' },
          { id: 's2', full_name: 'B', parent_email: null },
          { id: 's3', full_name: 'C', parent_email: 'c@x.com' },
        ], error: null },
        'test_attempts.select': { data: [], error: null },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'evaluation', all: true } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ sent: 2, skipped: 1, total: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/send-parent-result (default: student test result)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    configureSupabaseMock({ authUser: STUDENT_USER });
    process.env.BREVO_API_KEY = 'xkeysib-test';
  });
  afterEach(() => { delete process.env.BREVO_API_KEY; vi.unstubAllGlobals(); });

  it('still works for a student emailing their own result', async () => {
    const fetchMock = mockBrevoOk();
    configureSupabaseMock({
      results: { 'profiles.select': { data: { full_name: 'Omar', parent_email: 'p@x.com' }, error: null } },
    });
    const res = makeRes();
    await handler(makeReq({ body: { test_title: 'T', score: 8, max_score: 10, percentage: 80, passed: true } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
