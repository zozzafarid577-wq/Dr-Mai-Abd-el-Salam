import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const anonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  let isAdmin = user.app_metadata?.role === 'admin';
  if (!isAdmin) {
    const { data: prof } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    isAdmin = prof?.role === 'admin';
  }
  if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const { title, course_id, module_id, module_ids, is_mock, time_limit_min, questions, test_id, open_at, close_at } = req.body;
  if (!title || !course_id || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'title, course_id, and questions[] are required' });
  }
  if (open_at && close_at && new Date(close_at) <= new Date(open_at)) {
    return res.status(400).json({ error: 'close_at must be after open_at' });
  }

  // A test can belong to several lessons. Accept an array; fall back to the
  // single module_id for older callers.
  const lessonIds = Array.isArray(module_ids) && module_ids.length
    ? module_ids.filter(Boolean)
    : (module_id ? [module_id] : []);

  const testFields = {
    title,
    course_id,
    module_id: lessonIds[0] || null,
    module_ids: lessonIds,
    is_mock: !!is_mock,
    time_limit_min: time_limit_min ? parseInt(time_limit_min) : null,
    open_at: open_at || null,
    close_at: close_at || null,
  };

  // If test_id provided, update existing test; otherwise create new
  let testRecord;
  if (test_id) {
    const { data, error } = await supabaseAdmin
      .from('practice_tests')
      .update(testFields)
      .eq('id', test_id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    testRecord = data;

    // Delete all existing questions and re-insert (clean slate)
    await supabaseAdmin.from('test_questions').delete().eq('test_id', test_id);
  } else {
    const { data, error } = await supabaseAdmin
      .from('practice_tests')
      .insert({ ...testFields, is_active: true })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    testRecord = data;
  }

  const rows = questions.map((q, i) => ({
    test_id: testRecord.id,
    question_text: String(q.question_text || '').trim(),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correct_index: Number.isInteger(q.correct_index) ? q.correct_index : 0,
    explanation: q.explanation || null,
    image_url: q.image_url || null,
    order_index: i,
    points: 1,
  }));

  const { error: qErr } = await supabaseAdmin.from('test_questions').insert(rows);
  if (qErr) {
    if (!test_id) await supabaseAdmin.from('practice_tests').delete().eq('id', testRecord.id);
    return res.status(500).json({ error: qErr.message });
  }

  return res.status(200).json({
    test_id: testRecord.id,
    title,
    questions_saved: rows.length,
    is_mock: !!is_mock,
  });
}
