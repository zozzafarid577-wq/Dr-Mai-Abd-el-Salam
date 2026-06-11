import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeReq, makeRes } from '../helpers/http.js';
import {
  configureSupabaseMock,
  resetSupabaseMock,
  STUDENT_USER,
} from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));

const { default: handler } = await import('../../api/send-parent-result.js');

const resultBody = { test_title: 'Unit 3 Quiz', score: 8, max_score: 10, percentage: 80, passed: true };

function mockBrevo(response = { ok: true, body: { messageId: 'msg-1' } }) {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok,
    json: async () => response.body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('POST /api/send-parent-result', () => {
  beforeEach(() => {
    resetSupabaseMock();
    configureSupabaseMock({ authUser: STUDENT_USER });
    process.env.BREVO_API_KEY = 'xkeysib-test';
  });

  afterEach(() => {
    delete process.env.BREVO_API_KEY;
    vi.unstubAllGlobals();
  });

  it('rejects unauthenticated requests', async () => {
    configureSupabaseMock({ authUser: null });
    const res = makeRes();
    await handler(makeReq({ body: resultBody }), res);
    expect(res.statusCode).toBe(401);
  });

  it('skips silently when the student has no parent email', async () => {
    const fetchMock = mockBrevo();
    configureSupabaseMock({
      results: { 'profiles.select': { data: { full_name: 'Omar', parent_email: null }, error: null } },
    });
    const res = makeRes();
    await handler(makeReq({ body: resultBody }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the profile cannot be loaded', async () => {
    configureSupabaseMock({
      results: { 'profiles.select': { data: null, error: { message: 'row not found' } } },
    });
    const res = makeRes();
    await handler(makeReq({ body: resultBody }), res);
    expect(res.statusCode).toBe(500);
  });

  it('sends the result email to the parent through Brevo', async () => {
    const fetchMock = mockBrevo();
    configureSupabaseMock({
      results: {
        'profiles.select': {
          data: { full_name: 'Omar Ali', parent_email: 'parent@example.com' },
          error: null,
        },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: resultBody }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ sent: true, messageId: 'msg-1' });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(opts.headers['api-key']).toBe('xkeysib-test');

    const payload = JSON.parse(opts.body);
    expect(payload.to).toEqual([{ email: 'parent@example.com', name: 'Parent of Omar Ali' }]);
    expect(payload.subject).toBe('Omar Ali scored 80% on "Unit 3 Quiz"');
    expect(payload.htmlContent).toContain('8 out of 10 correct');
  });

  it('surfaces Brevo API errors as 500', async () => {
    mockBrevo({ ok: false, body: { message: 'invalid sender' } });
    configureSupabaseMock({
      results: {
        'profiles.select': { data: { full_name: 'Omar', parent_email: 'p@x.com' }, error: null },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: resultBody }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('invalid sender');
  });
});
