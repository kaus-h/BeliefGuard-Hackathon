// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Shared Type Definitions
// These interfaces are the canonical contract between all agents/modules.
// ──────────────────────────────────────────────────────────────────────

/** Potential blast radius of an assumption. */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** Output of the Confidence-to-Action Gate policy engine. */
export type GateDecision = 'PROCEED' | 'INSPECT_MORE' | 'ASK_USER' | 'BLOCK';

/** Origin category of evidence. */
export type SourceType = 'FILE' | 'CONFIG' | 'USER_PROMPT' | 'USER_ANSWER';

/** Category of a node in the Repo Belief Graph. */
export type BeliefType = 'REPO_FACT' | 'TASK_BELIEF' | 'AGENT_ASSUMPTION' | 'USER_CONSTRAINT';

// ── Core Object Interfaces ──────────────────────────────────────────

export interface Evidence {
    id: string;
    sourceType: SourceType;
    /** Specific file path or context identifier. */
    uri: string;
    /** Exact text snippet matching the heuristic. */
    snippet: string;
    /** Algorithmic weight applied to belief evaluation. */
    weight: number;
}

export interface Belief {
    id: string;
    statement: string;
    type: BeliefType;
    /** Float bounded between 0.0 and 1.0. */
    confidenceScore: number;
    riskLevel: RiskLevel;
    /** IDs of supporting Evidence nodes. */
    evidenceIds: string[];
    /** Whether cleared by the Confidence Gate. */
    isValidated: boolean;
    /** IDs of conflicting Belief nodes. */
    contradictions: string[];
}

export interface AgentPlan {
    intentDescription: string;
    targetFiles: string[];
    /** Raw assumptions prior to evidence grounding. */
    extractedBeliefs: Belief[];
}

export interface ClarificationQuestion {
    beliefId: string;
    questionText: string;
    /** Optional structured responses for rapid UI selection. */
    options?: string[];
}

export interface ValidationResult {
    isValid: boolean;
    /** Constraints violated by the generated patch. */
    violations: Belief[];
    /** Raw unified diff proposed for application. */
    diffPatch: string;
}

// ── Audit / Diagnostics Types ─────────────────────────────────────────

export type AuditLevel = 'info' | 'success' | 'warning' | 'error';

export type AuditPhase =
    | 'session'
    | 'context'
    | 'extraction'
    | 'beliefs'
    | 'grounding'
    | 'gate'
    | 'questions'
    | 'patch'
    | 'validation';

export interface AuditEvent {
    id: string;
    phase: AuditPhase;
    title: string;
    detail?: string;
    level: AuditLevel;
    timestamp: string;
    /** Optional structured payload for debugging/inspection in the UI. */
    data?: unknown;
}

// ── Webview Message Payloads ────────────────────────────────────────

/** Messages flowing FROM the Webview TO the extension host. */
export type WebviewToExtensionMessage =
    | { type: 'TASK_SUBMITTED'; payload: { task: string } }
    | { type: 'USER_ANSWERED'; payload: { beliefId: string; answer: string } }
    | { type: 'REVIEW_DIFF' }
    | { type: 'APPLY_PATCH' };

/** Messages flowing FROM the extension host TO the Webview. */
export type ExtensionToWebviewMessage =
    | { type: 'BELIEFS_EXTRACTED'; payload: { beliefs: Belief[]; questions: ClarificationQuestion[] } }
    | { type: 'PROCESSING'; payload: { message: string } }
    | { type: 'AUDIT_EVENT'; payload: { event: AuditEvent } }
    | { type: 'PATCH_READY'; payload: { diffPatch: string } }
    | { type: 'BLOCKED'; payload: { reason: string; violations: Belief[] } }
    | { type: 'ERROR'; payload: { message: string } };
