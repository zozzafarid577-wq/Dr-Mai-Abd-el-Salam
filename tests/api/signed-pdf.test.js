import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeReq, makeRes } from '../helpers/http.js';
import {
  configureSupabaseMock,
  resetSupabaseMock,
  getSupabaseCalls,
  STUDENT_USER,
} from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));

const { default: handler } = await import('../../api/student-activity.js');

const SUPA_PDF = 'https://test.supabase.co/storage/v1/object/public/pdfs/u1/notes.pdf';
const EXTERNAL_PDF = 'https://drive.google.com/file/d/abc/view';

function moduleLookup(file_url, course_id = 'c1') {
  return { 'module_pdfs.select': { data: { file_url, title: 'Notes', modules: { course_id } }, error: null } };
}

describe('POST /api/student-activity (action: signed-pdf)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    configureSupabaseMock({ authUser: STUDENT_USER });
  });

  it('requires pdf_id and a valid source', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { action: 'signed-pdf', pdf_id: 'p1', source: 'bogus' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('404s when the PDF does not exist', async () => {
    configureSupabaseMock({ results: { 'module_pdfs.select': { data: null, error: { message: 'no rows' } } } });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'signed-pdf', pdf_id: 'p1', source: 'module' } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('403s when the student is not enrolled in the PDF course', async () => {
    configureSupabaseMock({
      results: {
        ...moduleLookup(SUPA_PDF),
        'enrollments.select': { data: null, error: null },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'signed-pdf', pdf_id: 'p1', source: 'module' } }), res);
    expect(res.statusCode).toBe(403);
    expect(getSupabaseCalls('storage.createSignedUrl')).toHaveLength(0);
  });

  it('returns a signed URL for an enrolled student when the file is in Supabase storage', async () => {
    configureSupabaseMock({
      results: {
        ...moduleLookup(SUPA_PDF),
        'enrollments.select': { data: { course_id: 'c1' }, error: null },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'signed-pdf', pdf_id: 'p1', source: 'module' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.signed).toBe(true);
    expect(res.body.url).toContain('/object/sign/pdfs/u1/notes.pdf');
    const [sign] = getSupabaseCalls('storage.createSignedUrl');
    expect(sign.bucket).toBe('pdfs');
    expect(sign.path).toBe('u1/notes.pdf');
    expect(sign.ttl).toBe(300);
  });

  it('passes external links through unsigned (cannot sign Drive/Dropbox)', async () => {
    configureSupabaseMock({
      results: {
        ...moduleLookup(EXTERNAL_PDF),
        'enrollments.select': { data: { course_id: 'c1' }, error: null },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'signed-pdf', pdf_id: 'p1', source: 'module' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.signed).toBe(false);
    expect(res.body.url).toBe(EXTERNAL_PDF);
    expect(getSupabaseCalls('storage.createSignedUrl')).toHaveLength(0);
  });

  it('resolves lesson-level PDFs through lesson -> module -> course', async () => {
    configureSupabaseMock({
      results: {
        'lesson_pdfs.select': { data: { file_url: SUPA_PDF, title: 'L', lessons: { modules: { course_id: 'c9' } } }, error: null },
        'enrollments.select': { data: { course_id: 'c9' }, error: null },
      },
    });
    const res = makeRes();
    await handler(makeReq({ body: { action: 'signed-pdf', pdf_id: 'lp1', source: 'lesson' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.signed).toBe(true);
    const [enrolCall] = getSupabaseCalls('enrollments.select');
    expect(enrolCall.filters.course_id).toBe('c9');
  });

  it('requires a token', async () => {
    const res = makeRes();
    await handler(makeReq({ token: null, body: { action: 'signed-pdf', pdf_id: 'p1', source: 'module' } }), res);
    expect(res.statusCode).toBe(401);
  });
});
