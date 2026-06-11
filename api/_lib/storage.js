// Helpers for turning a stored file_url into a Supabase Storage
// (bucket, path) pair so it can be re-served as a short-lived signed URL.
// Returns null for anything that isn't a Supabase Storage object on THIS
// project (e.g. a pasted Google Drive / Dropbox / external link), which the
// caller then passes through unsigned.

// Matches both public and signed/object forms:
//   /storage/v1/object/public/<bucket>/<path>
//   /storage/v1/object/sign/<bucket>/<path>
//   /storage/v1/object/<bucket>/<path>
export function parseSupabaseStoragePath(fileUrl, supabaseUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;

  let u;
  try {
    u = new URL(fileUrl);
  } catch {
    return null;
  }

  // Must live on this project's Supabase host.
  if (supabaseUrl) {
    try {
      if (u.host !== new URL(supabaseUrl).host) return null;
    } catch {
      /* ignore malformed config */
    }
  }

  const m = u.pathname.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?([^/]+)\/(.+)$/);
  if (!m) return null;

  const bucket = decodeURIComponent(m[1]);
  const path = decodeURIComponent(m[2].split('?')[0]);
  if (!bucket || !path) return null;
  return { bucket, path };
}
