"use strict";
// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Post-Patch Validator Engine
// Performs a secondary heuristic analysis on the generated unified diff
// to ensure no USER_CONSTRAINT beliefs are violated before the patch
// is surfaced to the developer.
// ──────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGeneratedPatch = validateGeneratedPatch;
// ── Negation pairs for heuristic constraint-violation detection ──────
const CONSTRAINT_NEGATION_PAIRS = [
    [/\bpreserve\b/i, /\bremov(e|ed|ing)\b|\bdelet(e|ed|ing)\b/i],
    [/\bdo not alter\b/i, /\bmodif(y|ied|ies|ying)\b/i],
    [/\bdo not change\b/i, /\bchang(e|ed|es|ing)\b/i],
    [/\bno new dependenc/i, /\bnpm install\b|\byarn add\b|\bimport .+ from\b/i],
    [/\bbackward.?compat/i, /\bbreaking change/i],
    [/\bread[- ]?only\b/i, /\bwrit(e|able|ing|ten)\b/i],
    [/\bimmutable\b/i, /\bmutabl(e|tion|ted)\b/i],
    [/\bdo not (touch|modify|remove|delete)\b/i, /\b(touch|modif|remov|delet)(ed|ing|ies|y|e|s)?\b/i],
];
/**
 * Extracts the file paths modified by a unified diff by parsing the
 * `---` and `+++` header lines.
 */
function extractModifiedFiles(diffString) {
    const files = new Set();
    const lines = diffString.split(/\r?\n/);
    for (const line of lines) {
        // Unified diff header: +++ b/path/to/file or +++ path/to/file
        const match = line.match(/^\+\+\+\s+(?:b\/)?(.+)/);
        if (match && match[1] !== '/dev/null') {
            files.add(match[1].trim());
        }
    }
    return Array.from(files);
}
function stripCodeFences(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('```')) {
        return text;
    }
    return trimmed
        .replace(/^```[a-zA-Z0-9_-]*\r?\n/, '')
        .replace(/\r?\n```$/, '');
}
function normalizeStructuredBody(lines) {
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    if (nonEmptyLines.length > 0 && nonEmptyLines.every((line) => /^[+\- ]/.test(line))) {
        return lines
            .map((line) => (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')
            ? line.slice(1)
            : line))
            .join('\n');
    }
    return lines.join('\n');
}
function parseStructuredPatch(diffString) {
    const lines = stripCodeFences(diffString).split(/\r?\n/);
    const changes = [];
    let current = null;
    let bodyLines = [];
    const flush = () => {
        if (!current) {
            return;
        }
        changes.push({
            ...current,
            body: current.action === 'delete' ? '' : normalizeStructuredBody(bodyLines),
        });
    };
    for (const line of lines) {
        if (/^\*\*\*\s+(Begin Patch|End Patch)\s*$/.test(line)) {
            continue;
        }
        const match = line.match(/^\*\*\*\s+(Add File|Update File|Delete File):\s*(.+)$/);
        if (match) {
            flush();
            current = {
                action: match[1] === 'Add File'
                    ? 'add'
                    : match[1] === 'Update File'
                        ? 'update'
                        : 'delete',
                path: match[2].trim(),
                body: '',
            };
            bodyLines = [];
            continue;
        }
        if (current) {
            bodyLines.push(line);
        }
    }
    flush();
    return changes.filter((change) => change.path.length > 0);
}
/**
 * Extracts meaningful keywords from a constraint statement for matching
 * against diff content and file paths.
 */
function extractConstraintKeywords(statement) {
    const STOP_WORDS = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
        'do', 'does', 'did', 'not', 'must', 'should', 'will', 'can',
        'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by',
        'and', 'but', 'or', 'it', 'its', 'this', 'that', 'any',
    ]);
    return statement
        .toLowerCase()
        .replace(/[^a-z0-9\s._/-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}
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
function validateGeneratedPatch(diffString, validatedBeliefs) {
    const violations = [];
    const structuredChanges = parseStructuredPatch(diffString);
    const modifiedFiles = structuredChanges.length > 0
        ? Array.from(new Set(structuredChanges.map((change) => change.path).filter(Boolean)))
        : extractModifiedFiles(diffString);
    const validationText = structuredChanges.length > 0
        ? structuredChanges.map((change) => [change.path, change.body].filter(Boolean).join('\n')).join('\n') || diffString
        : diffString;
    const diffLower = validationText.toLowerCase();
    // Only evaluate USER_CONSTRAINT beliefs for violations
    const constraints = validatedBeliefs.filter((b) => b.type === 'USER_CONSTRAINT');
    for (const constraint of constraints) {
        let isViolated = false;
        const keywords = extractConstraintKeywords(constraint.statement);
        // ── Check 1: File-path overlap ──────────────────────────────────
        // If the constraint mentions specific file-like tokens (containing
        // dots or slashes), check whether the patch touches those files.
        const fileTokens = keywords.filter((k) => k.includes('.') || k.includes('/'));
        for (const fileToken of fileTokens) {
            for (const modifiedFile of modifiedFiles) {
                if (modifiedFile.toLowerCase().includes(fileToken)) {
                    isViolated = true;
                    break;
                }
            }
            if (isViolated)
                break;
        }
        // ── Check 2: Negation-pattern conflict ──────────────────────────
        if (!isViolated) {
            for (const [protectivePattern, actionPattern] of CONSTRAINT_NEGATION_PAIRS) {
                if (protectivePattern.test(constraint.statement)) {
                    // The constraint is protective; check if the patch performs the action.
                    if (actionPattern.test(validationText)) {
                        // Additional check: make sure the action relates to
                        // the same domain as the constraint (keyword overlap)
                        const domainOverlap = keywords.some((k) => k.length > 3 && diffLower.includes(k));
                        if (domainOverlap) {
                            isViolated = true;
                            break;
                        }
                    }
                }
            }
        }
        if (isViolated) {
            violations.push(constraint);
        }
    }
    return {
        isValid: violations.length === 0,
        violations,
        diffPatch: diffString,
    };
}
//# sourceMappingURL=PatchValidator.js.map