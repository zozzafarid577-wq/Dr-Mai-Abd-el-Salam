// Video provider helpers shared by the student player (portal/lessons.html)
// and the admin recording form (drmai-staff-portal/courses.html).
//
// Loaded in the browser as a plain <script> (exposes `window.Video`), and
// importable by the test runner (sets `globalThis.Video`).
globalThis.Video = (function () {
  // Pull a YouTube video id out of a full URL, or accept a bare id.
  function parseYouTubeId(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    const m =
      s.match(/[?&]v=([A-Za-z0-9_-]{6,})/) ||
      s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ||
      s.match(/\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{6,}$/.test(s)) return s; // already an id
    return null;
  }

  // Pull a Google Drive file id out of a share link, or accept a bare id.
  function parseDriveId(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    const m =
      s.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) ||
      s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) ||
      s.match(/\/d\/([A-Za-z0-9_-]{10,})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s; // already an id
    return null;
  }

  function parseVideoId(provider, raw) {
    return provider === 'gdrive' ? parseDriveId(raw) : parseYouTubeId(raw);
  }

  // Build the embeddable iframe URL for a provider + id.
  function videoEmbedUrl(provider, id) {
    if (!id) return '';
    if (provider === 'gdrive') {
      return `https://drive.google.com/file/d/${id}/preview`;
    }
    // YouTube (default): privacy-enhanced, no related videos / branding.
    const params = 'autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1';
    return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
  }

  return { parseYouTubeId, parseDriveId, parseVideoId, videoEmbedUrl };
})();
