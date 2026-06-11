// Leitner-style spaced repetition. Five boxes; a correct answer promotes
// the card one box (longer interval), a wrong answer resets it to box 1.
// Intervals are in days, indexed by box (1..5).
const INTERVALS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 16 };

export function reviewCard(prev, wasCorrect, now = new Date()) {
  const box = Math.min(Math.max(parseInt(prev?.box) || 1, 1), 5);
  const reviews = (parseInt(prev?.reviews) || 0) + 1;
  const correct = (parseInt(prev?.correct) || 0) + (wasCorrect ? 1 : 0);

  const nextBox = wasCorrect ? Math.min(box + 1, 5) : 1;
  const due = new Date(now.getTime() + INTERVALS[nextBox] * 24 * 60 * 60 * 1000);

  return {
    box: nextBox,
    reviews,
    correct,
    due_at: due.toISOString(),
    last_reviewed_at: now.toISOString(),
  };
}

export { INTERVALS };
