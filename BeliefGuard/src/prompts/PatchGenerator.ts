import { Belief, AgentPlan } from '../types';

export function getPatchGeneratorPrompt(userTask: string, validatedBeliefs: Belief[], agentPlan: AgentPlan): string {
    const beliefsContext = validatedBeliefs.map((b) => 
        `- [${b.type}] ${b.statement} (Validated: ${b.isValidated}, Risk: ${b.riskLevel}, Confidence: ${b.confidenceScore.toFixed(2)})`
    ).join('\n');

    return `You are an expert autonomous software engineer. Your task is to generate the final code patch required to complete the user's objective.

You MUST output a raw, unified diff that implements the required changes.

### VALIDATED BELIEFS & CONSTRAINTS
Below is the Belief Graph state, containing explicitly verified rules and facts regarding this repository:
${beliefsContext}

### EXPLICIT DIRECTIVE
You are strictly bound by the validated constraints provided in the belief state. Any code generated that violates a USER_CONSTRAINT or conflicts with a confirmed REPO_FACT will be rejected by the validation engine. You must not contradict any resolved beliefs.

### AGENT PLAN INTENT
${agentPlan.intentDescription}

### TARGET FILES
${agentPlan.targetFiles.join('\n')}

### USER TASK
${userTask}

Process the constraints and output the code patch as a raw unified diff.`;
}
