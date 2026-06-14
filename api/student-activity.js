import { createClient } from '@supabase/supabase-js';
import { reviewCard } from './_lib/srs.js';
import { parseSupabaseStoragePath } from './_lib/storage.js';

// Student-facing activity endpoint. One function, several actions, to stay
// within Vercel's per-deployment function limit:
//   GET  ?action=leaderboard&window=7|30|all
//   POST  { action: 'flashcard-review', question_id, correct }
//   POST  { action: 'signed-pdf', pdf_id, source: 'module'|'lesson' }
const anonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const SIGNED_URL_TTL_SEC = 300; // 5 minutes

export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  // Per-request client carrying the caller's token, so RLS / SECURITY DEFINER
  // scope everything to this student.
  const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const action = req.query?.action || req.body?.action;
  if (action === 'leaderboard')      return leaderboard(req, res, user, userClient);
  if (action === 'flashcard-review') return flashcardReview(req, res, user, userClient);
  if (action === 'signed-pdf')       return signedPdf(req, res, user);
  if (action === 'video-url')        return videoUrl(req, res, user);
  return res.status(400).json({ error: "action must be 'leaderboard', 'flashcard-review', 'signed-pdf' or 'video-url'" });
}

// Returns a short-lived URL for a lesson PDF, but only after confirming the
// student is enrolled in the PDF's course. Files stored in this project's
// Supabase Storage are served as expiring signed URLs; external links
// (Drive/Dropbox/etc.) are returned as-is since we cannot sign them.
async function signedPdf(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pdf_id, source } = req.body || {};
  if (!pdf_id || !['module', 'lesson'].includes(source)) {
    return res.status(400).json({ error: "pdf_id and source ('module'|'lesson') are required" });
  }

  // Look up the PDF and resolve its course, via service role.
  let fileUrl, title, courseId;
  if (source === 'module') {
    const { data, error } = await supabaseAdmin
      .from('module_pdfs')
      .select('file_url, title, modules(course_id)')
      .eq('id', pdf_id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'PDF not found' });
    fileUrl = data.file_url; title = data.title; courseId = data.modules?.course_id;
  } else {
    const { data, error } = await supabaseAdmin
      .from('lesson_pdfs')
      .select('file_url, title, lessons(modules(course_id))')
      .eq('id', pdf_id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'PDF not found' });
    fileUrl = data.file_url; title = data.title; courseId = data.lessons?.modules?.course_id;
  }

  if (!courseId) return res.status(404).json({ error: 'PDF is not linked to a course' });

  // Enforce enrollment server-side (independent of RLS).
  const { data: enrol } = await supabaseAdmin
    .from('enrollments')
    .select('course_id')
    .eq('student_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle();
  if (!enrol) return res.status(403).json({ error: 'Not enrolled in this course' });

  // Sign it if it's one of our Supabase Storage objects; otherwise pass through.
  const loc = parseSupabaseStoragePath(fileUrl, process.env.SUPABASE_URL);
  if (loc) {
    const { data: signed, error: signErr } = await supabaseAdmin
      .storage.from(loc.bucket).createSignedUrl(loc.path, SIGNED_URL_TTL_SEC);
    if (!signErr && signed?.signedUrl) {
      return res.status(200).json({ url: signed.signedUrl, title, signed: true, expires_in: SIGNED_URL_TTL_SEC });
    }
  }
  return res.status(200).json({ url: fileUrl, title, signed: false });
}

// Returns the embed URL for a lesson video, after confirming enrollment.
// The video_id / Drive file ID is never sent to the browser — only the
// final embeddable URL is returned, so students cannot extract or share it.
async function videoUrl(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { lesson_id } = req.body || {};
  if (!lesson_id) return res.status(400).json({ error: 'lesson_id is required' });

  // Fetch lesson + course via service role.
  const { data: lesson, error: lErr } = await supabaseAdmin
    .from('lessons')
    .select('id, video_id, youtube_id, video_provider, modules(course_id)')
    .eq('id', lesson_id)
    .single();
  if (lErr || !lesson) return res.status(404).json({ error: 'Lesson not found' });

  const courseId = lesson.modules?.course_id;
  if (!courseId) return res.status(404).json({ error: 'Lesson not linked to a course' });

  // Enforce enrollment.
  const { data: enrol } = await supabaseAdmin
    .from('enrollments')
    .select('course_id')
    .eq('student_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle();
  if (!enrol) return res.status(403).json({ error: 'Not enrolled in this course' });

  const rawId   = lesson.video_id || lesson.youtube_id;
  const provider = lesson.video_provider || 'youtube';
  if (!rawId) return res.status(404).json({ error: 'No video for this lesson yet' });

  let embedUrl;
  if (provider === 'gdrive') {
    embedUrl = `https://drive.google.com/file/d/${rawId}/preview`;
  } else {
    const params = 'autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1';
    embedUrl = `https://www.youtube-nocookie.com/embed/${rawId}?${params}`;
  }

  return res.status(200).json({ url: embedUrl, provider });
}

async function leaderboard(req, res, user, userClient) {
  const rawWindow = (req.query?.window ?? req.body?.window);
  const window_days = rawWindow === 'all' ? 0 : (parseInt(rawWindow) || 7);

  const { data, error } = await userClient.rpc('get_leaderboard', { window_days });
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data || []).map((r, i) => ({ ...r, rank: i + 1, is_me: r.student_id === user.id }));
  const me = rows.find((r) => r.is_me) || null;
  return res.status(200).json({ window_days, leaderboard: rows, me });
}

async function flashcardReview(req, res, user, userClient) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question_id, correct } = req.body || {};
  if (!question_id || typeof correct !== 'boolean') {
    return res.status(400).json({ error: 'question_id and boolean correct are required' });
  }

  const { data: prev } = await userClient
    .from('flashcard_progress')
    .select('box, reviews, correct')
    .eq('student_id', user.id)
    .eq('question_id', question_id)
    .maybeSingle();

  const next = reviewCard(prev, correct);

  const { data, error } = await userClient
    .from('flashcard_progress')
    .upsert({ student_id: user.id, question_id, ...next }, { onConflict: 'student_id,question_id' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
}
