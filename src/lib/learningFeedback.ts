export type LearningFeedback = {
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
  explanation: string | null;
};

export function createLearningFeedback(selectedIndex: number, correctIndex: number, explanation: string | null): LearningFeedback {
  return { selectedIndex, correctIndex, correct: selectedIndex === correctIndex, explanation };
}
