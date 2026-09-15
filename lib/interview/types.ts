export interface InterviewAnswers {
  [slot: string]: string | boolean;
}

export interface InterviewQuestion {
  slot: string;
  prompt: string;
  type: "text" | "boolean" | "single-select";
  options?: string[];
  required: boolean;
  /** Only asked when this returns true given answers so far. Omit for unconditional questions. */
  when?: (answers: InterviewAnswers) => boolean;
}

export type InterviewResult =
  | { done: false; question: InterviewQuestion }
  | { done: true };
