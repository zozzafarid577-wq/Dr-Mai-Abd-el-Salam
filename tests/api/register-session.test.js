import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeReq, makeRes } from '../helpers/http.js';
import {
  configureSupabaseMock,
  resetSupabaseMock,
  getSupabaseCalls,
  STUDENT_USER,
} from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));

const { default: handler } = await import('../../api/register-session.js');

describe('POST /api/register-session', () => {
  beforeEach(() => resetSupabaseMock());

  it('rejects requests without a token', async () => {
    const res = makeRes();
    await handler(makeReq({ token: null }), res);
    expect(res.statusCode).toBe(401);
  });

  it('issues a session token for students and stores it on the profile', async () => {
    configureSupabaseMock({
      authUser: STUDENT_USER,
      results: { 'profiles.select': { data: { role: 'student' }, error: null } },
    });
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.session_token).toMatch(/^[0-9a-f-]{36}$/);

    const [update] = getSupabaseCalls('profiles.update');
    expect(update.payload.session_token).toBe(res.body.session_token);
    expect(update.filters.id).toBe(STUDENT_USER.id);
  });

  it('returns a null token for admins (multi-session allowed)', async () => {
    configureSupabaseMock({
      results: { 'profiles.select': { data: { role: 'admin' }, error: null } },
    });
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.session_token).toBeNull();
    expect(getSupabaseCalls('profiles.update')).toHaveLength(0);
  });
});
