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

// Parse a free-text block of MCQs pasted from Word/Docs/plain text.
// Recognised shape per question:
//   1. Question text...           (number/bullet prefix optional)
//   A) option   B) option ...     (A-H, with ) . : or - separators)
//   Answer: B                     (letter or full text; * on an option also works)
// Blank line(s) separate questions.
export function parseQuestionsFromText(text) {
  const blocks = String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const out = [];
  const optRe = /^\s*[*]?\s*([A-Ha-h])\s*[).:\-]\s+(.*)$/;
  const ansRe = /^\s*(?:answer|correct|ans)\s*[:.\-]?\s*(.+)$/i;

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd());
    const qLines = [];
    const options = [];
    let answerRaw = null;
    let starIndex = -1;

    for (const line of lines) {
      const ans = line.match(ansRe);
      const opt = line.match(optRe);
      if (ans && !opt) {
        answerRaw = ans[1].trim();
      } else if (opt) {
        if (/^\s*[*]/.test(line)) starIndex = options.length;
        options.push(opt[2].trim());
      } else if (!options.length) {
        qLines.push(line);
      }
    }

    const question_text = qLines.join(' ').replace(/^\s*\d+\s*[).:\-]\s*/, '').trim();
    if (!question_text || options.length < 2) continue;

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

    out.push({ question_text, options, correct_index, explanation: null });
  }

  return out;
}
