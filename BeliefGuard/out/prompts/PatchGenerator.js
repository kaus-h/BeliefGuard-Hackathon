"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPatchGeneratorPrompt = getPatchGeneratorPrompt;
function getPatchGeneratorPrompt(userTask, validatedBeliefs, agentPlan, repositoryContext = '') {
    const beliefsContext = validatedBeliefs.map((b) => `- [${b.type}] ${b.statement} (Validated: ${b.isValidated}, Risk: ${b.riskLevel}, Confidence: ${b.confidenceScore.toFixed(2)})`).join('\n');
    return `You are an expert autonomous software engineer. Your task is to generate the final code patch required to complete the user's objective.

You MUST return a single JSON object with exactly this shape:
{
  "assistantMessage": "brief user-facing explanation of what will change and why",
  "diffPatch": "structured patch text or empty string"
}

Rules:
- assistantMessage must be plain natural-language chat output for the extension sidebar. Do not include code fences, no markdown diff blocks, and no file contents in assistantMessage.
- diffPatch must contain ONLY a valid structured patch envelope. No prose before it, no prose after it.
- If the task is not concrete enough to map to repository edits, set diffPatch to an empty string and use assistantMessage to ask for a more specific coding task instead of inventing files.
- When diffPatch is not empty, it MUST follow this exact envelope:
  *** Begin Patch
  *** Update File: path/to/file.ts
  @@
  -old line
  +new line
  *** Add File: path/to/new-file.ts
  +entire file contents with + prefixes for each line
  *** Delete File: path/to/delete-me.ts
  *** End Patch
- Use one file block per target file. Keep unrelated files in separate blocks so the extension can review them individually.
- Every file path must be a real workspace-relative path.
- Do not use placeholder or synthetic file names like "unknown", "analysis.json", "output.txt", "patch.diff", or temporary file names unless they are explicitly part of the repository task.
- Prefer editing the files listed in TARGET FILES when possible.
- If you need to create a new file, use a real workspace-relative repository path that matches the task.
- Use ONLY repository paths that are explicitly listed in TARGET FILES unless you are creating a closely-related new repository file required by the task.
- If the task touches multiple files, return multiple file blocks in the same patch instead of collapsing them into a single monolithic diff.
- For Update File blocks, include only the minimum necessary context and changes for that file.
- For Add File blocks, every content line must begin with '+'.
- For Delete File blocks, do not include file contents.

### VALIDATED BELIEFS & CONSTRAINTS
Below is the Belief Graph state, containing explicitly verified rules and facts regarding this repository:
${beliefsContext}

### EXPLICIT DIRECTIVE
You are strictly bound by the validated constraints provided in the belief state. Any code generated that violates a USER_CONSTRAINT or conflicts with a confirmed REPO_FACT will be rejected by the validation engine. You must not contradict any resolved beliefs.

### AGENT PLAN INTENT
${agentPlan.intentDescription}

### TARGET FILES
${agentPlan.targetFiles.join('\n')}

### REPOSITORY CONTEXT
${repositoryContext || '(No additional repository context supplied for patch generation.)'}

### USER TASK
${userTask}

Process the constraints and return the JSON object now.`;
}
//# sourceMappingURL=PatchGenerator.js.map