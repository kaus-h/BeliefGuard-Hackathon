import type { Belief, ClarificationQuestion } from '../types';
/**
 * Generates an array of clarification questions from beliefs that the
 * Confidence Gate has flagged as requiring user input.
 *
 * Only beliefs matching BOTH conditions are surfaced:
 *   • `isValidated === false`
 *   • `riskLevel === 'HIGH'`
 *
 * This ensures the developer is never bombarded with low-value questions,
 * per the spec's directive to escalate only high-blast-radius uncertainties.
 *
 * @param beliefs  The full array of beliefs in the current session.
 * @returns        Formatted questions ready for the Webview payload.
 */
export declare function generateQuestions(beliefs: Belief[]): ClarificationQuestion[];
//# sourceMappingURL=QuestionGenerator.d.ts.map