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
  if (req.method !== 'POST') return res.status(405).end();

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

  const {
    id, course_id, module_id, question_type, difficulty,
    question_text, options, correct_index, correct_answer,
    explanation, image_url, tags, status, statements,
  } = req.body;

  if (!question_text?.trim()) return res.status(400).json({ error: 'question_text is required' });
  if (!question_type)         return res.status(400).json({ error: 'question_type is required' });

  const payload = {
    course_id:      course_id      || null,
    module_id:      module_id      || null,
    question_type:  question_type,
    difficulty:     difficulty     || 'medium',
    question_text:  question_text.trim(),
    options:        Array.isArray(options) && options.length ? options.map(String) : null,
    correct_index:  Number.isInteger(correct_index) ? correct_index : null,
    correct_answer: correct_answer || null,
    explanation:    explanation    || null,
    image_url:      image_url      || null,
    tags:           Array.isArray(tags) && tags.length ? tags : null,
    status:         status         || 'published',
    statements:     Array.isArray(statements) && statements.length ? statements : null,
    updated_at:     new Date().toISOString(),
  };

  let result, err;
  if (id) {
    ({ data: result, error: err } = await supabaseAdmin
      .from('question_bank').update(payload).eq('id', id).select().single());
  } else {
    ({ data: result, error: err } = await supabaseAdmin
      .from('question_bank').insert(payload).select().single());
  }

  if (err) return res.status(500).json({ error: err.message });
  return res.status(200).json(result);
}
