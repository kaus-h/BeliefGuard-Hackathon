# 🛡️ BeliefGuard

**Preventing Agent Drift through Belief-Aware Governance.**

BeliefGuard is a VS Code / Antigravity extension that inserts a **belief-aware governance layer** between a developer and an autonomous coding workflow. Its primary purpose is to prevent **agent drift**: the failure mode where an AI coding agent turns uncertain, implicit assumptions into concrete file edits without first validating whether those assumptions are true or acceptable to the user.

---

## 🚀 The Core Thesis

Coding agents fail NOT because they lack context, but because they lack **structured, explicit beliefs**.

Traditional agent workflows retrieve files, ask an LLM for a solution, and apply a patch. BeliefGuard intercepts this flow to ask:
- What is the agent assuming?
- What is actually supported by repository evidence?
- Which uncertainties are dangerous enough to block edits?
- What should be clarified with the developer before code is touched?

---

## 🏛️ Architectural Pillars

BeliefGuard is built on three foundational mechanisms:

### 1. Repo Belief Graph
A dynamic, structured representation of the system's understanding. It maps:
- **Repo Facts**: Immutable truths extracted from manifests (e.g., `package.json`, `tsconfig.json`).
- **Agent Assumptions**: Inferred logic that lacks immediate verification.
- **User Constraints**: Facts explicitly confirmed by the developer.
- **Evidence**: Direct pointers to workspace artifacts supporting or contradicting beliefs.

### 2. Confidence-to-Action Gate
A deterministic policy engine that governs the execution flow based on belief risk and confidence scores:
- **`PROCEED`**: High confidence, no unresolved high-risk beliefs. 🟢
- **`INSPECT_MORE`**: Partial uncertainty; triggers autonomous repository scanning. 🔍
- **`ASK_USER`**: High-risk uncertainty; escalates to a clarifying question in the UI. ❓
- **`BLOCK`**: Architectural violation or unresolvable contradiction detected. 🛑

### 3. thinkN / `beliefs` SDK Integration
The central nervous system for belief state. It provides:
- **Persistent Memory**: Tracks beliefs across iterative prompting cycles.
- **Contradiction Tracking**: Native SDK logic to detect if new propositions conflict with validated state.
- **Thread-Scoped Execution**: Each task maintains its own isolated belief context.

---

## 🔄 The 11-Step Guarded Pipeline

1.  **Task Submission**: User enters a request in the sidebar.
2.  **Context Collection**: Scanner gathers workspace structure and manifests.
3.  **Plan & Belief Extraction**: LLM generates an execution plan and explicit beliefs (no code yet).
4.  **Graph Population**: Beliefs are registered in local state and synced to thinkN.
5.  **Evidence Grounding**: Heuristics scan the workspace to support or contradict beliefs.
6.  **Gate Evaluation**: The policy engine determines the next action.
7.  **Clarification Loop**: If the gate triggers `ASK_USER`, the developer answers targeted questions.
8.  **Re-Evaluation**: Verified answers become `USER_CONSTRAINT` nodes; the gate re-evaluates.
9.  **Patch Generation**: Once the gate reaches `PROCEED`, the LLM generates a code patch.
10. **Post-Patch Validation**: The patch is verified against the validated belief graph.
11. **Review & Apply**: The developer reviews the diff and applies it to the workspace.

---

## 📂 Repository Structure

- **`BeliefGuard/src/`**: The core extension source code.
  - **`extension.ts`**: Entry point and command registration.
  - **`controller/MainOrchestrator.ts`**: The "brain" managing the 11-step pipeline.
  - **`beliefs/`**: thinkN integration and graph logic.
  - **`gate/`**: Confidence gate and question generation.
  - **`ai/`**: LLM clients and prompt templates.
  - **`webview/`**: Sidebar UI implementation.
  - **`context/`**: Workspace scanning and evidence discovery.
  - **`utils/`**: Unified diff handling and file system helpers.
- **`AGENTS.md`**: Authoritative onboarding and handoff reference.
- **`New_sprint.md`**: Current development focus and roadmap.
- **`VS Code Extension_ Belief Graph & Action Gate.txt`**: The original architectural blueprint.

---

## 🛠️ Setup & Development

### Prerequisites
- [VS Code](https://code.visualstudio.com/)
- [Node.js](https://nodejs.org/) (v18+)

### Installation
1.  Clone the repository.
2.  Navigate to the `BeliefGuard` directory:
    ```bash
    cd BeliefGuard
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```
4.  Configure your environment:
    Create a `.env` file in the `BeliefGuard` root and add your keys:
    ```env
    OPENROUTER_API_KEY=your_key_here
    THINKN_API_KEY=your_key_here
    ```

### Running the Extension
1.  Open the project in VS Code.
2.  Press **F5** (or go to `Run and Debug` -> `Extension`) to launch the Extension Development Host.
3.  In the new window, find the **BeliefGuard** icon in the Activity Bar.

---

## 🌊 Current Sprint Focus

We are currently focused on **thinkN E2E Recovery and Patch Channel Hardening**:
- Restoring full thread-scoped thinkN integration.
- Implementing "Fail-Fast" readiness gating.
- Refining structured per-file patch reviews.
- Ensuring strict separation between assistant narration and workspace edits.

---

## 🏆 Hackathon Context

BeliefGuard was designed for **VillageHacks 2026** under the **thinkN** track at Arizona State University. It addresses the critical gap between agent memory and belief coherence in autonomous software engineering.

---

## ⚖️ License

[MIT License](LICENSE) (or as per project configuration).
