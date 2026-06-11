import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeReq, makeRes } from '../helpers/http.js';
import {
  configureSupabaseMock,
  resetSupabaseMock,
  getSupabaseCalls,
  STUDENT_USER,
} from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));

const { default: deleteStudent } = await import('../../api/delete-student.js');
const { default: resetPassword } = await import('../../api/reset-student-password.js');

describe('POST /api/delete-student', () => {
  beforeEach(() => resetSupabaseMock());

  it('rejects non-POST methods', async () => {
    const res = makeRes();
    await deleteStudent(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects non-admin callers', async () => {
    configureSupabaseMock({ authUser: STUDENT_USER });
    const res = makeRes();
    await deleteStudent(makeReq({ body: { student_id: 'x' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('requires student_id', async () => {
    const res = makeRes();
    await deleteStudent(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('refuses to delete a non-student account', async () => {
    configureSupabaseMock({
      results: { 'profiles.select': { data: { role: 'admin' }, error: null } },
    });
    const res = makeRes();
    await deleteStudent(makeReq({ body: { student_id: 'other-admin' } }), res);

    expect(res.statusCode).toBe(403);
    expect(getSupabaseCalls('auth.admin.deleteUser')).toHaveLength(0);
  });

  it('deletes the auth user and cleans up the profile row', async () => {
    configureSupabaseMock({
      results: { 'profiles.select': { data: { role: 'student' }, error: null } },
    });
    const res = makeRes();
    await deleteStudent(makeReq({ body: { student_id: 'stu-1' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });

    const [del] = getSupabaseCalls('auth.admin.deleteUser');
    expect(del.args[0]).toBe('stu-1');

    const [profileDelete] = getSupabaseCalls('profiles.delete');
    expect(profileDelete.filters.id).toBe('stu-1');
  });

  it('returns 500 when the auth deletion fails', async () => {
    configureSupabaseMock({
      results: {
        'profiles.select': { data: { role: 'student' }, error: null },
        'auth.admin.deleteUser': { data: null, error: { message: 'boom' } },
      },
    });
    const res = makeRes();
    await deleteStudent(makeReq({ body: { student_id: 'stu-1' } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('boom');
  });
});

describe('POST /api/reset-student-password', () => {
  beforeEach(() => resetSupabaseMock());

  it('rejects non-admin callers', async () => {
    configureSupabaseMock({ authUser: STUDENT_USER });
    const res = makeRes();
    await resetPassword(makeReq({ body: { student_id: 'x' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('requires student_id', async () => {
    const res = makeRes();
    await resetPassword(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('sets a new 12-char password and forces must_change_pw', async () => {
    const res = makeRes();
    await resetPassword(makeReq({ body: { student_id: 'stu-1' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.password).toHaveLength(12);

    const [update] = getSupabaseCalls('auth.admin.updateUserById');
    expect(update.args[0]).toBe('stu-1');
    expect(update.args[1].password).toBe(res.body.password);

    const [profileUpdate] = getSupabaseCalls('profiles.update');
    expect(profileUpdate.payload).toEqual({ must_change_pw: true });
    expect(profileUpdate.filters.id).toBe('stu-1');
  });

  it('returns 500 and no password when the auth update fails', async () => {
    configureSupabaseMock({
      results: { 'auth.admin.updateUserById': { data: null, error: { message: 'nope' } } },
    });
    const res = makeRes();
    await resetPassword(makeReq({ body: { student_id: 'stu-1' } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.password).toBeUndefined();
  });
});
