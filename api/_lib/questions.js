// Shared helpers for question parsing/normalization, used by the
// AI generate + text-import endpoints. Kept dependency-free so it is
// trivial to unit test.

// Pull the first JSON array out of a model/raw string, tolerating
// markdown fences or surrounding prose.
export function extractJsonArray(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
  if (!s.startsWith('[')) {
    const start = s.indexOf('[');
    const end = s.lastIndexOf(']');
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
  }
  const parsed = JSON.parse(s);
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of questions');
  return parsed;
}

// Coerce one loosely-shaped question into the canonical MCQ shape the
// rest of the app stores. Returns null for unusable rows so callers can
// filter them out rather than persist garbage.
export function normalizeQuestion(q) {
  if (!q || typeof q !== 'object') return null;

  const question_text = String(q.question_text ?? q.question ?? '').trim();
  if (!question_text) return null;

  const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [];
  if (options.length < 2) return null;

  let correct_index = Number(q.correct_index);
  if (!Number.isInteger(correct_index) || correct_index < 0 || correct_index >= options.length) {
    // Fall back to matching a textual correct_answer against the options.
    const answer = q.correct_answer != null ? String(q.correct_answer).trim().toLowerCase() : '';
    const matched = options.findIndex((o) => o.toLowerCase() === answer);
    correct_index = matched >= 0 ? matched : 0;
  }

  const explanation = q.explanation != null ? String(q.explanation).trim() : '';
  return { question_text, options, correct_index, explanation: explanation || null };
}

// Parse a free-text block of questions pasted from Word/Docs/plain text.
// Each blank-line-separated block becomes one question. Recognised shapes:
//
//   MCQ:           question, then A) / - / • options, answer via "Answer: B",
//                  a leading "*B)" or a trailing * / ✓ on the correct option.
//   True/False:    statement followed by "Answer: True" (no options needed),
//                  or two options that are exactly True / False.
//   Fill in blank: question (usually with ___) followed by "Answer: text",
//                  with no options.
//   Choose term:   a "Terms: a, b, c" line, then statements each ending in
//                  "= A" or "(A)". Any other line becomes the group title.
//
// Every parsed question carries question_type plus the fields that type uses
// (options/correct_index for choice types, correct_answer for tf/fill,
// statements for grouped terms).
export function parseQuestionsFromText(text) {
  const blocks = String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const out = [];
  for (const block of blocks) {
    const q = parseTermsBlock(block) || parseStandardBlock(block);
    if (q) out.push(q);
  }
  return out;
}

const ANS_RE    = /^(?:answer|correct answer|correct|ans)\s*[:.\-)]?\s*(.+)$/i;
const EXPL_RE   = /^(?:explanation|explain|because)\s*[:.\-]\s*(.+)$/i;
const LETTER_RE = /^([A-Ha-h])\s*[).:\-]\s+(.*)$/;   // A) text | B. text | C: text | D- text
const BULLET_RE = /^[-–—•·]\s+(.*)$/;                // - text | • text
const TERMS_RE  = /^terms?\s*[:\-]\s*(.+)$/i;        // Terms: Osmosis, Diffusion, ...
const STMT_EQ_RE    = /^(?:\d+\s*[).:\-]\s*)?(.+?)\s*(?:=|→|->)\s*([A-Za-z])\s*$/;  // 1. text = B
const STMT_PAREN_RE = /^(?:\d+\s*[).:\-]\s*)?(.+?)\s*\(\s*([A-Za-z])\s*\)\s*$/;     // 1. text (B)

// A grouped Choose-Term question: a Terms: pool line plus statements that
// each name their correct letter.
function parseTermsBlock(block) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const termsLine = lines.find((l) => TERMS_RE.test(l));
  if (!termsLine) return null;

  const pool = termsLine.match(TERMS_RE)[1]
    .split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  if (pool.length < 2) return null;

  const statements = [];
  const titleLines = [];
  for (const line of lines) {
    if (line === termsLine) continue;
    const m = line.match(STMT_EQ_RE) || line.match(STMT_PAREN_RE);
    if (m) {
      const idx = m[2].toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < pool.length) {
        statements.push({ text: m[1].trim(), correct_index: idx });
        continue;
      }
    }
    titleLines.push(line);
  }
  if (!statements.length) return null;

  return {
    question_type: 'terms',
    question_text: titleLines.join(' ').replace(/^\s*\d+\s*[).:\-]\s*/, '').trim()
      || 'Choose the correct term for each statement.',
    options: pool,
    correct_index: null,
    correct_answer: null,
    statements,
    explanation: null,
  };
}

function parseStandardBlock(block) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const qLines = [];
  const options = [];
  let answerRaw = null;
  let explanation = null;
  let starIndex = -1;

  for (const line of lines) {
    // Strip a correctness marker (leading or trailing * / ✓) and remember it.
    let work = line;
    let marked = false;
    const trail = work.match(/[ \t]*[*✓]+[ \t]*$/);
    if (trail && trail.index > 0) { work = work.slice(0, trail.index).trimEnd(); marked = true; }
    if (/^[*✓]\s*[A-Ha-h]\s*[).:\-]/.test(work)) { work = work.replace(/^[*✓]\s*/, ''); marked = true; }

    const letter = work.match(LETTER_RE);
    const bullet = letter ? null : work.match(BULLET_RE);
    const optBody = letter ? letter[2].trim() : (bullet ? bullet[1].trim() : null);

    if (optBody) {
      if (marked) starIndex = options.length;
      options.push(optBody);
    } else {
      const ans  = line.match(ANS_RE);
      const expl = ans ? null : line.match(EXPL_RE);
      if (ans) answerRaw = ans[1].trim();
      else if (expl) explanation = expl[1].trim();
      else if (!options.length) qLines.push(line);
    }
  }

  const question_text = qLines.join(' ').replace(/^\s*\d+\s*[).:\-]\s*/, '').trim();
  if (!question_text) return null;

  // No options: a bare "Answer:" line makes this True/False or Fill-in-blank.
  if (options.length < 2) {
    if (!answerRaw) return null;
    if (/^(true|false)$/i.test(answerRaw)) {
      const isTrue = /^t/i.test(answerRaw);
      return {
        question_type: 'true_false', question_text,
        options: ['True', 'False'], correct_index: isTrue ? 0 : 1,
        correct_answer: isTrue ? 'true' : 'false',
        statements: null, explanation,
      };
    }
    return {
      question_type: 'fill_blank', question_text,
      options: null, correct_index: null,
      correct_answer: answerRaw,
      statements: null, explanation,
    };
  }

  let correct_index = -1;
  if (starIndex >= 0) {
    correct_index = starIndex;
  } else if (answerRaw) {
    const letter = answerRaw.match(/^([A-Ha-h])\b/);
    if (letter) {
      correct_index = letter[1].toUpperCase().charCodeAt(0) - 65;
    } else {
      correct_index = options.findIndex((o) => o.toLowerCase() === answerRaw.toLowerCase());
    }
  }
  if (correct_index < 0 || correct_index >= options.length) correct_index = 0;

  // Two options that read True/False are a True/False question.
  const lower = options.map((o) => o.toLowerCase());
  if (options.length === 2 && lower.includes('true') && lower.includes('false')) {
    return {
      question_type: 'true_false', question_text, options, correct_index,
      correct_answer: lower[correct_index] === 'true' ? 'true' : 'false',
      statements: null, explanation,
    };
  }

  return {
    question_type: 'mcq', question_text, options, correct_index,
    correct_answer: options[correct_index] || null,
    statements: null, explanation,
  };
}
