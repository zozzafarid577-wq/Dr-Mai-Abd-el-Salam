import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeReq, makeRes } from '../helpers/http.js';
import {
  configureSupabaseMock,
  resetSupabaseMock,
  getSupabaseCalls,
  ADMIN_USER,
  STUDENT_USER,
} from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));

const { default: handler } = await import('../../api/create-student.js');

const validBody = { full_name: 'Sara Ahmed', email: 'sara@example.com' };

describe('POST /api/create-student', () => {
  beforeEach(() => resetSupabaseMock());

  it('rejects non-POST methods', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects requests without a bearer token', async () => {
    const res = makeRes();
    await handler(makeReq({ token: null, body: validBody }), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid tokens', async () => {
    configureSupabaseMock({ authUser: null });
    const res = makeRes();
    await handler(makeReq({ body: validBody }), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-admin users even when profile lookup confirms student role', async () => {
    configureSupabaseMock({
      authUser: STUDENT_USER,
      results: { 'profiles.select': { data: { role: 'student' }, error: null } },
    });
    const res = makeRes();
    await handler(makeReq({ body: validBody }), res);
    expect(res.statusCode).toBe(403);
  });

  it('allows admins identified via profiles table fallback (no app_metadata role)', async () => {
    configureSupabaseMock({
      authUser: { id: 'legacy-admin', app_metadata: {} },
      results: { 'profiles.select': { data: { role: 'admin' }, error: null } },
    });
    const res = makeRes();
    await handler(makeReq({ body: validBody }), res);
    expect(res.statusCode).toBe(200);
  });

  it('requires full_name and email', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { full_name: 'No Email' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('creates the auth user, inserts a profile, and returns a generated password', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { ...validBody, phone: '0100', parent_email: 'p@example.com' } }), res);

    expect(res.statusCode).toBe(200);
    expect(typeof res.body.password).toBe('string');
    expect(res.body.password).toHaveLength(12);

    const [createCall] = getSupabaseCalls('auth.admin.createUser');
    expect(createCall.args[0]).toMatchObject({
      email: 'sara@example.com',
      email_confirm: true,
      app_metadata: { role: 'student' },
    });

    const [profileInsert] = getSupabaseCalls('profiles.insert');
    expect(profileInsert.payload).toMatchObject({
      id: 'new-uid',
      full_name: 'Sara Ahmed',
      phone: '0100',
      parent_email: 'p@example.com',
      role: 'student',
      must_change_pw: true,
    });
  });

  it('generates passwords with upper, lower, digit, and special characters', async () => {
    for (let i = 0; i < 5; i++) {
      resetSupabaseMock();
      const res = makeRes();
      await handler(makeReq({ body: validBody }), res);
      const pw = res.body.password;
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[!@#$%&*]/);
    }
  });

  it('enrolls the student in the given courses', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { ...validBody, course_ids: ['c1', 'c2'] } }), res);

    expect(res.statusCode).toBe(200);
    const [enrollInsert] = getSupabaseCalls('enrollments.insert');
    expect(enrollInsert.payload).toEqual([
      { student_id: 'new-uid', course_id: 'c1' },
      { student_id: 'new-uid', course_id: 'c2' },
    ]);
  });

  it('rolls back the auth user when the profile insert fails', async () => {
    configureSupabaseMock({
      results: { 'profiles.insert': { data: null, error: { message: 'duplicate key' } } },
    });
    const res = makeRes();
    await handler(makeReq({ body: validBody }), res);

    expect(res.statusCode).toBe(500);
    const [deleteCall] = getSupabaseCalls('auth.admin.deleteUser');
    expect(deleteCall.args[0]).toBe('new-uid');
  });

  it('returns 400 with the Supabase message when auth user creation fails', async () => {
    configureSupabaseMock({
      results: {
        'auth.admin.createUser': { data: { user: null }, error: { message: 'email exists' } },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: validBody }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('email exists');
  });
});

describe('admin check ordering', () => {
  beforeEach(() => resetSupabaseMock());

  it('skips the profiles lookup when the JWT already says admin', async () => {
    configureSupabaseMock({ authUser: ADMIN_USER });
    const res = makeRes();
    await handler(makeReq({ body: validBody }), res);
    expect(res.statusCode).toBe(200);
    const roleLookups = getSupabaseCalls('profiles.select');
    expect(roleLookups).toHaveLength(0);
  });
});
