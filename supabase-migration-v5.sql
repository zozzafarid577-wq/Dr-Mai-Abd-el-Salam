-- ================================================================
-- Dr Mai Portal — Migration v5
-- Run this in Supabase SQL Editor AFTER migration v4
-- ================================================================

-- ── 1. Set mai.mohamed.ahmed.1481979@gmail.com as admin ──────────
-- Updates app_metadata (JWT role claim) and profiles table
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'mai.mohamed.ahmed.1481979@gmail.com';

UPDATE public.profiles
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'mai.mohamed.ahmed.1481979@gmail.com');

-- ── 2. Add image_url to test_questions ──────────────────────────
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ── 3. Animal Behaviour Practice Tests ─────────────────────────
-- Inserts Practice 1 (14 questions, Q1-7 not recovered) and
-- Practice 2 (23 questions, all recovered) for the Animal Behavior
-- module of ACT Biology Basics.
DO $$
DECLARE
  act_course_id    UUID;
  animal_module_id UUID;
  p1_test_id       UUID;
  p2_test_id       UUID;
BEGIN
  SELECT id INTO act_course_id FROM public.courses WHERE title = 'ACT Biology Basics' LIMIT 1;
  IF act_course_id IS NULL THEN
    RAISE NOTICE 'ACT Biology Basics course not found — skipping animal behaviour tests';
    RETURN;
  END IF;

  SELECT id INTO animal_module_id
  FROM public.modules
  WHERE course_id = act_course_id AND title = 'Animal Behavior'
  LIMIT 1;

  IF animal_module_id IS NULL THEN
    RAISE NOTICE 'Animal Behavior module not found — skipping animal behaviour tests';
    RETURN;
  END IF;

  -- Remove any previous inserts so migration is safe to re-run
  DELETE FROM public.practice_tests
  WHERE module_id = animal_module_id
    AND title IN ('Animal Behaviour Practice 1', 'Animal Behaviour Practice 2');

  -- ── Practice 1 (Q8–Q21 recovered; Q1–7 were on a page not captured) ──
  INSERT INTO public.practice_tests (title, course_id, module_id, is_active, is_mock, time_limit_min)
  VALUES ('Animal Behaviour Practice 1', act_course_id, animal_module_id, true, false, null)
  RETURNING id INTO p1_test_id;

  INSERT INTO public.test_questions
    (test_id, question_text, options, correct_index, explanation, order_index, points)
  VALUES
  -- Q8  (A) Fixed action pattern
  (p1_test_id,
   'Innate, highly stereotypical behavior that must continue until completed.',
   ARRAY['Fixed action pattern','Habituation','Classical conditioning','Imprinting','Operant conditioning'],
   0, null, 1, 1),
  -- Q9  (E) Operant conditioning
  (p1_test_id,
   'Trial and error learning.',
   ARRAY['Fixed action pattern','Habituation','Classical conditioning','Imprinting','Operant conditioning'],
   4, null, 2, 1),
  -- Q10 (A) Fixed action pattern
  (p1_test_id,
   'A sequence of behaviors that is carried to completion once initiated.',
   ARRAY['Fixed action pattern','Habituation','Classical conditioning','Imprinting','Operant conditioning'],
   0, null, 3, 1),
  -- Q11 (B) Habituation
  (p1_test_id,
   'An amoeba moved away from a very strong light source and then resumed its normal movement.',
   ARRAY['Fixed action pattern','Habituation','Classical conditioning','Imprinting','Operant conditioning'],
   1, null, 4, 1),
  -- Q12 (E) Operant conditioning
  (p1_test_id,
   'The way dogs are trained.',
   ARRAY['Fixed action pattern','Habituation','Classical conditioning','Imprinting','Operant conditioning'],
   4, null, 5, 1),
  -- Q13 (C) Classical conditioning
  (p1_test_id,
   'A sophisticated process that modifies an organism''s responses as a result of experience.',
   ARRAY['Fixed action pattern','Habituation','Classical conditioning','Imprinting','Operant conditioning'],
   2, null, 6, 1),
  -- Q14 (A) Altruism
  (p1_test_id,
   'Reduces an individual''s reproductive fitness while increasing the fitness of family members.',
   ARRAY['Altruism','Mutualism','Competition','Commensalism','Parasitism'],
   0, null, 7, 1),
  -- Q15 (A) Operant conditioning
  (p1_test_id,
   'A friend trains a puppy to wait at the curb until told to cross by rewarding it with treats.',
   ARRAY['Operant conditioning','Classical conditioning','Habituation','Imprinting','Fixed action pattern'],
   0, null, 8, 1),
  -- Q16 (D) Imprinting
  (p1_test_id,
   'Learning that occurs during a sensitive or critical period and is irreversible.',
   ARRAY['Fixed action pattern','Habituation','Classical conditioning','Imprinting','Operant conditioning'],
   3, null, 9, 1),
  -- Q17 (B) Imprinting
  (p1_test_id,
   'Mary had a little lamb whose fleece was white as snow. And everywhere that Mary went the lamb was sure to go.',
   ARRAY['Fixed action pattern','Imprinting','Classical conditioning','Habituation','Operant conditioning'],
   1, null, 10, 1),
  -- Q18 (B) Sign stimuli
  (p1_test_id,
   'Fixed action patterns are initiated by external stimuli called ___.',
   ARRAY['Releasers','Sign stimuli','Innate releasing mechanisms','Supernormal stimuli','Displacement activities'],
   1, null, 11, 1),
  -- Q19 (B) Related to the animals they help
  (p1_test_id,
   'Animals that help other animals are expected to be ___.',
   ARRAY['Stronger than them','Related to the animals they help','Of higher social rank','Unrelated to them','Of a different species'],
   1, null, 12, 1),
  -- Q20 (B) Kin selection
  (p1_test_id,
   'An animal that sacrifices itself for its relatives is an example of ___.',
   ARRAY['Altruism','Kin selection','Reciprocal altruism','Group selection','Natural selection'],
   1, null, 13, 1),
  -- Q21 (E) Mimicry
  (p1_test_id,
   'Zygops rufitorquis is a species of weevil with the same color patterns and markings as the unrelated flesh fly. This is an example of ___.',
   ARRAY['Camouflage','Warning coloration','Countershading','Disruptive coloration','Mimicry'],
   4, null, 14, 1);

  -- ── Practice 2 (Q1–Q23, all recovered) ───────────────────────
  INSERT INTO public.practice_tests (title, course_id, module_id, is_active, is_mock, time_limit_min)
  VALUES ('Animal Behaviour Practice 2', act_course_id, animal_module_id, true, false, null)
  RETURNING id INTO p2_test_id;

  -- Q1 has an image (dog with "Sit"/"Stay" labels)
  INSERT INTO public.test_questions
    (test_id, question_text, options, correct_index, explanation, order_index, points, image_url)
  VALUES
  (p2_test_id,
   'The training shown in the image refers to which type of learning?',
   ARRAY['Operant conditioning','Classical conditioning','Habituation','Imprinting','Fixed action pattern'],
   0, null, 1, 1,
   '/assets/questions/animal-behaviour-p2-q1.png');

  INSERT INTO public.test_questions
    (test_id, question_text, options, correct_index, explanation, order_index, points)
  VALUES
  -- Q2  (A) Imprinting
  (p2_test_id,
   'Geese hatchlings follow the first thing they see after hatching. This is an example of ___.',
   ARRAY['Imprinting','Habituation','Classical conditioning','Operant conditioning','Fixed action pattern'],
   0, null, 2, 1),
  -- Q3  (C) Fixed action pattern
  (p2_test_id,
   'Innate, highly stereotypical behaviour that is continued to completion no matter how useless.',
   ARRAY['Habituation','Classical conditioning','Fixed action pattern','Imprinting','Operant conditioning'],
   2, null, 3, 1),
  -- Q4  (E) Operant conditioning
  (p2_test_id,
   'Trial and error learning.',
   ARRAY['Fixed action pattern','Habituation','Classical conditioning','Imprinting','Operant conditioning'],
   4, null, 4, 1),
  -- Q5  (B) Habituation
  (p2_test_id,
   'A farmer put a scarecrow in his field. The birds were initially scared of the scarecrow but after a few days showed no reaction to it.',
   ARRAY['Operant conditioning','Habituation','Classical conditioning','Imprinting','Fixed action pattern'],
   1, null, 5, 1),
  -- Q6  (C) Habituation example
  (p2_test_id,
   'Which of the following is an example of habituation?',
   ARRAY['A dog salivating at the sound of a bell after training','Baby geese following Konrad Lorenz after hatching','A turtle stops retreating into its shell after several taps on it','A dog learning to sit for treats','A spider spinning its first web'],
   2, null, 6, 1),
  -- Q7  (A) Imprinting
  (p2_test_id,
   'Geese hatchlings follow the first thing they see after hatching.',
   ARRAY['Imprinting','Habituation','Classical conditioning','Operant conditioning','Fixed action pattern'],
   0, null, 7, 1),
  -- Q8  (D) Habituation
  (p2_test_id,
   'Birds on the roadside take flight when a car passes. After many cars have passed, they stop flying away. This is an example of ___.',
   ARRAY['Fixed action pattern','Operant conditioning','Imprinting','Habituation','Classical conditioning'],
   3, null, 8, 1),
  -- Q9  (C) Imprinting
  (p2_test_id,
   'Young birds follow the first moving object they see after being born.',
   ARRAY['Fixed action pattern','Habituation','Imprinting','Classical conditioning','Operant conditioning'],
   2, null, 9, 1),
  -- Q10 (D) Imprinting
  (p2_test_id,
   'Konrad Lorenz described a type of learning that occurs during sensitive or critical periods and is irreversible.',
   ARRAY['Fixed action pattern','Habituation','Classical conditioning','Imprinting','Operant conditioning'],
   3, null, 10, 1),
  -- Q11 (A) Visual
  (p2_test_id,
   'The male amur bitterling fish guides the female to a mussel using her egg-laying tube. The type of stimulus responsible for this behaviour is ___.',
   ARRAY['Visual','Auditory','Chemical','Tactile','Electrical'],
   0, null, 11, 1),
  -- Q12 (A) Imprinting
  (p2_test_id,
   'Geese hatchlings follow the first thing they see after hatching.',
   ARRAY['Imprinting','Classical conditioning','Fixed action pattern','Altruism','Operant conditioning'],
   0, null, 12, 1),
  -- Q13 (C) Fixed action pattern
  (p2_test_id,
   'Innate, highly stereotypical behaviour that is continued to completion.',
   ARRAY['Habituation','Classical conditioning','Fixed action pattern','Imprinting','Operant conditioning'],
   2, null, 13, 1),
  -- Q14 (E) Operant conditioning
  (p2_test_id,
   'Trial and error learning.',
   ARRAY['Fixed action pattern','Habituation','Classical conditioning','Imprinting','Operant conditioning'],
   4, null, 14, 1),
  -- Q15 (D) Classical conditioning
  (p2_test_id,
   'Every time a can opener is used, cats run into the kitchen.',
   ARRAY['Fixed action pattern','Habituation','Imprinting','Classical conditioning','Operant conditioning'],
   3, null, 15, 1),
  -- Q16 (B) Learning
  (p2_test_id,
   'Imprinting, habituation, and conditioning are all examples of ___.',
   ARRAY['Instinct','Learning','Reflex','Tropism','Taxis'],
   1, null, 16, 1),
  -- Q17 (B) Taxis
  (p2_test_id,
   'A protozoan moves toward a food source. This type of movement is called ___.',
   ARRAY['Kinesis','Taxis','Reflex','Imprinting','Habituation'],
   1, null, 17, 1),
  -- Q18 (E) Trial and error
  (p2_test_id,
   'A mouse placed in a maze for the first time searches for food. This is an example of ___.',
   ARRAY['Classical conditioning','Imprinting','Habituation','Insight','Trial and error'],
   4, null, 18, 1),
  -- Q19 (D) Sparrow
  (p2_test_id,
   'Which of the following organisms is able to regulate its own body temperature?',
   ARRAY['Crocodile','Snake','Salamander','Sparrow','Shark'],
   3, null, 19, 1),
  -- Q20 (D) Habituation  [4-option question]
  (p2_test_id,
   'Simple learning that involves the loss of sensitivity to a repeated stimulus.',
   ARRAY['Reasoning/insight','Imprinting','Classical conditioning','Habituation'],
   3, null, 20, 1),
  -- Q21 (B) Imprinting
  (p2_test_id,
   'Geese that recognized a ticking clock as their "mother" were exposed to it during a critical period. This is an example of ___.',
   ARRAY['Classical conditioning','Imprinting','Fixed action pattern','Habituation','Operant conditioning'],
   1, null, 21, 1),
  -- Q22 (C) Classical conditioning
  (p2_test_id,
   'Fish that are always given food when their bowl is tapped learn to approach the surface when the bowl is tapped.',
   ARRAY['Fixed action pattern','Habituation','Classical conditioning','Imprinting','Operant conditioning'],
   2, null, 22, 1),
  -- Q23 (D) Mimicry
  (p2_test_id,
   'Some insect species resemble other poisonous or distasteful species. This is an example of ___.',
   ARRAY['Camouflage','Warning coloration','Countershading','Mimicry','Disruptive coloration'],
   3, null, 23, 1);

  RAISE NOTICE 'Animal Behaviour Practice 1 (ID: %) — 14 questions inserted', p1_test_id;
  RAISE NOTICE 'Animal Behaviour Practice 2 (ID: %) — 23 questions inserted', p2_test_id;
END $$;
