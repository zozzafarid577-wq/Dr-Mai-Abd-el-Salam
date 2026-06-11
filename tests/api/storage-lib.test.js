import { describe, it, expect } from 'vitest';
import { parseSupabaseStoragePath } from '../../api/_lib/storage.js';

const SUPA = 'https://proj.supabase.co';

describe('parseSupabaseStoragePath', () => {
  it('parses a public storage URL', () => {
    expect(
      parseSupabaseStoragePath('https://proj.supabase.co/storage/v1/object/public/pdfs/unit1/notes.pdf', SUPA)
    ).toEqual({ bucket: 'pdfs', path: 'unit1/notes.pdf' });
  });

  it('parses a signed storage URL and strips the query', () => {
    expect(
      parseSupabaseStoragePath('https://proj.supabase.co/storage/v1/object/sign/pdfs/a/b.pdf?token=xyz', SUPA)
    ).toEqual({ bucket: 'pdfs', path: 'a/b.pdf' });
  });

  it('decodes percent-encoded paths', () => {
    expect(
      parseSupabaseStoragePath('https://proj.supabase.co/storage/v1/object/public/pdfs/Unit%201/My%20Notes.pdf', SUPA)
    ).toEqual({ bucket: 'pdfs', path: 'Unit 1/My Notes.pdf' });
  });

  it('returns null for a different host (external link)', () => {
    expect(
      parseSupabaseStoragePath('https://drive.google.com/file/d/abc/view', SUPA)
    ).toBeNull();
  });

  it('returns null for a Supabase URL that is not a storage object', () => {
    expect(parseSupabaseStoragePath('https://proj.supabase.co/rest/v1/whatever', SUPA)).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseSupabaseStoragePath('not a url', SUPA)).toBeNull();
    expect(parseSupabaseStoragePath('', SUPA)).toBeNull();
    expect(parseSupabaseStoragePath(null, SUPA)).toBeNull();
  });

  it('still parses when no supabaseUrl is supplied (host check skipped)', () => {
    expect(
      parseSupabaseStoragePath('https://anything.example/storage/v1/object/public/b/p.pdf')
    ).toEqual({ bucket: 'b', path: 'p.pdf' });
  });
});
