import type { Belief, ValidationResult } from '../types';
/**
 * Validates a generated patch against the set of validated beliefs.
 *
 * The validator performs two layers of heuristic checking:
 *
 *   1. **File-path matching** — If a USER_CONSTRAINT references specific
 *      files (by name or path fragment), and the diff modifies those files,
 *      it is flagged as a potential violation.
 *
 *   2. **Negation-pattern matching** — If a USER_CONSTRAINT contains a
 *      protective keyword (e.g., "preserve", "do not alter") and the diff
 *      content contains the opposing action keyword, the violation is flagged.
 *
 * @param diffString        The generated patch string returned by the LLM.
 * @param validatedBeliefs  The full set of beliefs (all types) from the session.
 * @returns                 A ValidationResult indicating pass/fail and specific violations.
 */
export declare function validateGeneratedPatch(diffString: string, validatedBeliefs: Belief[]): ValidationResult;
//# sourceMappingURL=PatchValidator.d.ts.map