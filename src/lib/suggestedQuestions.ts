/**
 * The 3 questions the engine answers deterministically, with zero Bedrock calls — imported by both
 * the UI's suggested-question chips (src/components/AskPanel.tsx) and the backend's canned-question
 * matcher (server/src/ask.ts) so the exact wording can never drift out of sync between the two.
 */
export const SUGGESTED_QUESTIONS = [
  'What breaks if AWS goes down?',
  'Which vendor is my biggest single risk?',
  "What's the cheapest way to cut concentration?",
] as const
