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

export interface PatchFileSummary {
    path: string;
    status: 'ADDED' | 'MODIFIED' | 'DELETED';
    additions: number;
    deletions: number;
}

export interface PatchSummary {
    fileCount: number;
    additions: number;
    deletions: number;
    files: PatchFileSummary[];
}

export interface PatchGenerationResult {
    assistantMessage: string;
    diffPatch: string;
    structuredPatch?: Array<{
        path: string;
        status: 'ADDED' | 'MODIFIED' | 'DELETED';
        patch: string;
        summary?: string;
        additions?: number;
        deletions?: number;
        oldPath?: string;
        newPath?: string;
    }>;
}

/** High-level file operation used by the structured patch envelope. */
export type StructuredPatchAction = 'ADD_FILE' | 'UPDATE_FILE' | 'DELETE_FILE';

/** A single file block within a structured patch payload. */
export interface StructuredPatchBlock {
    action: StructuredPatchAction;
    path: string;
    content: string;
}

/** Parsed structured patch payload returned by the model. */
export interface StructuredPatchDocument {
    blocks: StructuredPatchBlock[];
}

/** UI review state for a single file inside a structured patch. */
export type PerFileReviewDecision = 'PENDING' | 'APPROVE' | 'REJECT';

export interface PerFilePatchReview {
    path: string;
    action: StructuredPatchAction;
    decision: PerFileReviewDecision;
    summary?: string;
    diffPreview?: string;
}

export interface StructuredPatchReviewState {
    currentIndex: number;
    files: PerFilePatchReview[];
}

export interface FileChangeReadyPayload {
    changeId?: string;
    fileChange: {
        path: string;
        diffPatch: string;
        summary?: PatchFileSummary;
    };
    index?: number;
    totalFiles?: number;
}

export interface StreamingChunkPayload {
    chunk: string;
}

// ── Audit / Diagnostics Types ─────────────────────────────────────────

export type AuditLevel = 'info' | 'success' | 'warning' | 'error';

export type AuditPhase =
    | 'session'
    | 'context'
    | 'extraction'
    | 'beliefs'
    | 'thinkn'
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
    | { type: 'APPROVE_FILE_CHANGE'; payload: FileChangeReadyPayload }
    | { type: 'REJECT_FILE_CHANGE'; payload: FileChangeReadyPayload }
    | { type: 'REVIEW_DIFF' }
    | { type: 'APPLY_PATCH' }
    | { type: 'REJECT_PATCH' };

/** Messages flowing FROM the extension host TO the Webview. */
export type ExtensionToWebviewMessage =
    | { type: 'BELIEFS_EXTRACTED'; payload: { beliefs: Belief[]; questions: ClarificationQuestion[] } }
    | { type: 'BELIEF_GRAPH_UPDATED'; payload: { beliefs: Belief[] } }
    | { type: 'PROCESSING'; payload: { message: string } }
    | { type: 'ASSISTANT_MESSAGE'; payload: { title: string; message: string } }
    | { type: 'AUDIT_EVENT'; payload: { event: AuditEvent } }
    | { type: 'FILE_CHANGE_READY'; payload: FileChangeReadyPayload }
    | { type: 'FILE_REVIEW_COMPLETE'; payload: { appliedPaths: string[]; rejectedPaths: string[] } }
    | { type: 'STREAMING_CHUNK'; payload: StreamingChunkPayload }
    | { type: 'PATCH_READY'; payload: { diffPatch: string; summary: PatchSummary } }
    | { type: 'STRUCTURED_PATCH_READY'; payload: { assistantMessage: string; patch: StructuredPatchDocument; summary: PatchSummary } }
    | { type: 'STRUCTURED_PATCH_FILE_READY'; payload: { review: PerFilePatchReview; index: number; totalFiles: number } }
    | { type: 'BLOCKED'; payload: { reason: string; violations: Belief[] } }
    | { type: 'PATCH_FILE_DECISION_REQUESTED'; payload: { path: string; action: StructuredPatchAction; index: number; totalFiles: number } }
    | { type: 'ERROR'; payload: { message: string } };
