"use strict";
// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Clarification Question Generator
// Converts unverified high-risk beliefs into concise, human-readable
// questions for the Webview clarification loop.
// ──────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQuestions = generateQuestions;
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
function generateQuestions(beliefs) {
    return beliefs
        .filter((b) => b.isValidated === false && b.riskLevel === 'HIGH')
        .map((belief) => {
        // Normalise the statement for natural reading:
        // strip trailing period/whitespace, lowercase the first character
        // so it flows naturally into the question template.
        const rawStatement = belief.statement.replace(/[.\s]+$/, '');
        const normalised = rawStatement.charAt(0).toLowerCase() + rawStatement.slice(1);
        return {
            beliefId: belief.id,
            questionText: `The agent assumes ${normalised}. Is this correct?`,
            options: ["Yes, that's correct", "No, that's wrong"],
        };
    });
}
//# sourceMappingURL=QuestionGenerator.js.map