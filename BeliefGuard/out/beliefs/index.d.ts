/**
 * BeliefGuard — Beliefs Module Barrel Export
 *
 * Consumers can import everything from `../beliefs` rather than
 * reaching into individual files.
 */
export { BeliefStateManager } from './ThinkNClient';
export { getUnverifiedHighRiskBeliefs, getUnverifiedBeliefs, getContradictedBeliefs, detectContradictions, takeSnapshot, } from './BeliefGraph';
export type { Belief, Evidence, BeliefType, RiskLevel, SourceType, EdgeRelation, BeliefEdge, BeliefGraphSnapshot, AgentPlan, ClarificationQuestion, ValidationResult, } from './types';
//# sourceMappingURL=index.d.ts.map