import { describe, it, expect } from 'vitest';
import {
  extractJsonArray,
  normalizeQuestion,
  parseQuestionsFromText,
} from '../../api/_lib/questions.js';

describe('extractJsonArray', () => {
  it('parses a bare JSON array', () => {
    expect(extractJsonArray('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('strips ```json fences', () => {
    expect(extractJsonArray('```json\n[1,2,3]\n```')).toEqual([1, 2, 3]);
  });

  it('extracts an array embedded in prose', () => {
    expect(extractJsonArray('Sure! Here you go: [{"x":1}] — enjoy')).toEqual([{ x: 1 }]);
  });

  it('throws when there is no array', () => {
    expect(() => extractJsonArray('not json')).toThrow();
  });
});

describe('normalizeQuestion', () => {
  it('returns a canonical MCQ shape', () => {
    expect(
      normalizeQuestion({ question_text: ' Q ', options: ['a', 'b'], correct_index: 1, explanation: 'x' })
    ).toEqual({ question_text: 'Q', options: ['a', 'b'], correct_index: 1, explanation: 'x' });
  });

  it('accepts a "question" alias and trims options', () => {
    const q = normalizeQuestion({ question: 'Q', options: [' a ', ' b '], correct_index: 0 });
    expect(q.question_text).toBe('Q');
    expect(q.options).toEqual(['a', 'b']);
    expect(q.explanation).toBeNull();
  });

  it('falls back to correct_answer text when index is missing', () => {
    const q = normalizeQuestion({ question_text: 'Q', options: ['Red', 'Green'], correct_answer: 'green' });
    expect(q.correct_index).toBe(1);
  });

  it('clamps an out-of-range correct_index to 0', () => {
    const q = normalizeQuestion({ question_text: 'Q', options: ['a', 'b'], correct_index: 9 });
    expect(q.correct_index).toBe(0);
  });

  it('rejects rows with fewer than two options or no text', () => {
    expect(normalizeQuestion({ question_text: 'Q', options: ['only'] })).toBeNull();
    expect(normalizeQuestion({ question_text: '', options: ['a', 'b'] })).toBeNull();
    expect(normalizeQuestion(null)).toBeNull();
  });
});

describe('parseQuestionsFromText', () => {
  it('parses numbered questions with lettered options and an Answer line', () => {
    const text = `1. What is the powerhouse of the cell?
A) Nucleus
B) Mitochondrion
C) Ribosome
D) Golgi
Answer: B

2. Water is made of hydrogen and what?
A. Carbon
B. Oxygen
C. Nitrogen
Answer: B`;
    const out = parseQuestionsFromText(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      question_text: 'What is the powerhouse of the cell?',
      options: ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi'],
      correct_index: 1,
    });
    expect(out[1].correct_index).toBe(1);
  });

  it('supports a starred correct option instead of an Answer line', () => {
    const text = `Which is a gas?
A) Iron
*B) Helium
C) Gold`;
    const [q] = parseQuestionsFromText(text);
    expect(q.correct_index).toBe(1);
  });

  it('matches a full-text answer against the options', () => {
    const text = `Capital of France?
A) Berlin
B) Paris
Answer: Paris`;
    expect(parseQuestionsFromText(text)[0].correct_index).toBe(1);
  });

  it('defaults to index 0 when the answer is unparseable', () => {
    const text = `Pick one
A) first
B) second`;
    expect(parseQuestionsFromText(text)[0].correct_index).toBe(0);
  });

  it('skips blocks that have fewer than two options', () => {
    const text = `Just a heading with no options

Real question
A) one
B) two
Answer: A`;
    const out = parseQuestionsFromText(text);
    expect(out).toHaveLength(1);
    expect(out[0].question_text).toBe('Real question');
  });

  it('returns an empty array for empty input', () => {
    expect(parseQuestionsFromText('')).toEqual([]);
    expect(parseQuestionsFromText(null)).toEqual([]);
  });
});
