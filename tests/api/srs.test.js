import { describe, it, expect } from 'vitest';
import { reviewCard, INTERVALS } from '../../api/_lib/srs.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const daysBetween = (a, b) => Math.round((new Date(a) - b) / 86400000);

describe('reviewCard', () => {
  it('starts a brand-new card at box 1 and promotes on a correct answer', () => {
    const r = reviewCard(undefined, true, NOW);
    expect(r.box).toBe(2);
    expect(r.reviews).toBe(1);
    expect(r.correct).toBe(1);
    expect(daysBetween(r.due_at, NOW)).toBe(INTERVALS[2]);
  });

  it('promotes one box per correct answer and schedules the matching interval', () => {
    const r = reviewCard({ box: 3, reviews: 5, correct: 4 }, true, NOW);
    expect(r.box).toBe(4);
    expect(r.reviews).toBe(6);
    expect(r.correct).toBe(5);
    expect(daysBetween(r.due_at, NOW)).toBe(INTERVALS[4]);
  });

  it('caps promotion at box 5', () => {
    expect(reviewCard({ box: 5 }, true, NOW).box).toBe(5);
  });

  it('resets to box 1 on a wrong answer and does not increment correct', () => {
    const r = reviewCard({ box: 4, reviews: 9, correct: 7 }, false, NOW);
    expect(r.box).toBe(1);
    expect(r.reviews).toBe(10);
    expect(r.correct).toBe(7);
    expect(daysBetween(r.due_at, NOW)).toBe(INTERVALS[1]);
  });

  it('records the review timestamp', () => {
    expect(reviewCard(undefined, true, NOW).last_reviewed_at).toBe(NOW.toISOString());
  });
});
