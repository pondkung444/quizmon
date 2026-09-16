export type LearningFeedback = {
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
  explanation: string | null;
};

export function createLearningFeedback(selectedIndex: number, correctIndex: number, explanation: string | null): LearningFeedback {
  return { selectedIndex, correctIndex, correct: selectedIndex === correctIndex, explanation };
}

export function selectMissedQuestions<T>(questions: T[], correctness: Array<boolean | undefined>, limit = 3): T[] {
  return questions.filter((_, index) => correctness[index] === false).slice(0, limit);
}
