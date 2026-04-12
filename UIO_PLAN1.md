**UI Overhaul Plan**

This is a handoff-ready, no-code implementation plan for a dedicated agent to own the BeliefGuard webview overhaul end to end.

It is designed to preserve all current behavior and logic while materially improving clarity, polish, and submission-readiness.

Primary implementation surface:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts)
- [types.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/types.ts)
- Logic to preserve, not redesign:
  - [MainOrchestrator.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/controller/MainOrchestrator.ts)
  - [LLMClient.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/ai/LLMClient.ts)
  - [ThinkNClient.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/beliefs/ThinkNClient.ts)

**Mission**
Redesign the BeliefGuard extension webview so it feels:
- clean
- coherent
- native to VS Code
- differentiated from Cline
- trustworthy
- governance-first

The new UI must:
- preserve all current functionality
- preserve current message protocol and orchestration behavior
- avoid logic changes
- remove emoji-heavy controls
- replace fragmented card stacking with a strong transcript-first experience
- feel polished enough for hackathon submission

**Non-Negotiable Constraints**
- No changes to orchestration logic.
- No changes to gate policy.
- No changes to thinkN workflow.
- No changes to patch semantics.
- No changes to file approval semantics.
- No changes to webview-extension message contracts unless absolutely required for UI-only needs.
- No addition of Cline code or external repo files into this codebase.
- No dependency on cloning external reference repos into the workspace.
- UI changes should remain local to the BeliefGuard webview layer unless a minimal type/UI contract addition is necessary.

**Current Product Truth**
BeliefGuard is not just a chat assistant. It is a belief-governed execution controller.

The UI currently has to express these runtime phases:
- task submission
- processing/progress
- belief extraction
- clarification
- audit visibility
- belief graph visibility
- streaming generation
- per-file review
- patch review
- apply/reject outcome
- blocked/error states

Those phases already exist in the current provider and message contracts:
- webview events in [types.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/types.ts#L176)
- UI rendering and handlers in [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L295)

**Current UI Problems To Solve**
- The interface is panel-first, not transcript-first.
- Too many things are rendered as cards.
- Chat, audit, graph, streaming, and file review feel like separate apps.
- There is duplicated information across audit and chat.
- Emoji/glyph-heavy controls reduce polish and trust.
- All states have similar visual weight.
- There is weak hierarchy between “main narrative” and “supporting diagnostics.”
- The current inline HTML/CSS/JS structure makes reuse and consistency harder.
- Encoding issues are visibly corrupting glyphs in some labels and text.
- The current UX does not communicate the core product story as clearly as the architecture deserves.

Examples in current UI:
- emoji/glyph button and summary labels in [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L267)
- standalone file review panel in [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L270)
- standalone streaming panel in [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L277)
- audit and graph as separate stacked panels in [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L284)
- belief review card rendering in [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L446)
- patch-ready card rendering in [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L476)

**Reference Direction From Cline**
Use Cline as reference for:
- one primary conversation stream
- specialized row types inside that stream
- progressive disclosure
- native-feeling iconography
- restrained visual weight
- stateful inline approval/review moments

Do not emulate Cline’s branding or surface identity. BeliefGuard should feel more analytical, governance-oriented, and calm.

Public references used for guidance:
- https://github.com/cline/cline/tree/main/webview-ui
- https://github.com/cline/cline/tree/main/webview-ui/src/components
- https://github.com/cline/cline/tree/main/webview-ui/src/components/chat

**Target UX Thesis**
The redesigned UI should communicate one simple feeling:

“I am watching one guarded run progress through reasoning, validation, and approval.”

That means:
- one primary transcript
- one sticky input/composer
- one compact status header
- one secondary inspector area
- inline action moments
- expandable diagnostics
- minimal visual noise

**Target Information Architecture**
Primary structure:
- Header
- Main transcript
- Sticky composer
- Secondary inspector rail or collapsible utility sections

Header should contain:
- BeliefGuard identity
- run status badge
- optional compact phase indicator
- optional lightweight controls for opening inspectors

Main transcript should contain:
- user task row
- system progress rows
- assistant narrative rows
- belief review row
- clarification row
- file review rows
- patch ready row
- blocked/error rows
- completion row

Secondary inspector should contain:
- Audit
- Beliefs
- Files

These inspectors should support the transcript, not compete with it.

**Target Visual Identity**
Visual direction:
- native VS Code look and feel
- codicons instead of emojis
- restrained borders
- strong spacing
- compact chips
- clear typography hierarchy
- consistent surfaces
- subtle state color, not loud novelty color

BeliefGuard-specific differentiation:
- emphasize trust and governance
- use clean status language
- use belief/gate terminology intentionally
- avoid flashy “AI assistant” energy
- feel like a guarded operator console, not a toy bot

**Iconography Rules**
- Replace emoji buttons and emoji section labels with codicons or icon-like text treatments.
- Use icons only where they improve scanability.
- Icons should never be the primary meaning carrier.
- Good icon targets:
  - submit
  - review
  - apply
  - reject
  - expand/collapse
  - warning
  - success
  - blocked
  - file
  - graph
  - history/audit
- Avoid decorative icon spam.

**Core UX Principles**
- One run, one story.
- Diagnostics are subordinate to the main flow.
- User actions should happen where the user is already looking.
- Rows should be compact by default and detailed on demand.
- Status should be obvious at a glance.
- BeliefGuard should feel more precise than chatty.
- Empty states should be calm and useful.
- Every interactive surface should answer “what happens next?”
- High-risk states should feel serious without becoming visually noisy.

**Detailed Redesign Scope**

**1. Header Redesign**
Current header is thin and mostly ornamental.

Target header should include:
- BeliefGuard title
- compact status chip
- current run phase label
- optional “Inspect” toggles or buttons for Audit / Beliefs / Files
- no decorative emoji shield

Suggested statuses:
- Idle
- Inspecting
- Awaiting clarification
- Generating patch
- Ready for review
- Applying
- Completed
- Blocked
- Error

Header should remain compact and never dominate the viewport.

**2. Transcript-First Main Body**
The `chat-thread` should become the true center of gravity.

Convert the conversation from generic card stacking into row-based flow:
- user row
- assistant row
- system status row
- review row
- result row

Rows should differ by role and state, not by arbitrary card style inflation.

Current row entry point:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L317)

New row system should support:
- compact headers
- compact metadata
- inline actions
- expandable detail sections
- optional badges for risk/confidence/status

**3. Composer Redesign**
Current composer is functional but generic.

Target:
- sticky bottom composer
- cleaner input hierarchy
- primary submit button without emoji
- better placeholder tone
- optional helper line for shortcut hint
- clearer state when disabled/submitting

Current composer area:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L264)

**4. Belief Review UX**
Current belief review is a large action card with chips and nested blocks.

Target:
- inline “gate paused” review row inside transcript
- compact blocking belief list
- questions directly under the row
- clearer separation between “what’s blocking” and “what you need to answer”
- option to expand full graph from this row
- no oversized card-shell feel

Current behavior to preserve:
- blocking beliefs shown
- questions rendered
- answer submission flow
- graph expansion action

Current implementation:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L446)

**5. Audit UX**
Current audit is useful but over-separated and partially duplicated in chat.

Target:
- keep audit as an inspector
- keep it searchable/scannable
- reduce chat mirroring to only high-value events
- make audit rows compact and log-like
- preserve details expansion
- position audit as “run trace,” not as the main content stream

Current implementation:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L499)

Specific recommendation:
- only mirror milestone events into chat
- keep full detail history in inspector
- avoid duplicating every progress signal

**6. Belief Graph UX**
Current graph panel is useful but visually heavy and separate from the narrative.

Target:
- keep graph available
- make it a supporting inspector
- reduce node visual weight
- emphasize belief statement first
- badges second
- metadata third
- clearer grouping and scanability
- focus on confidence, validation, conflicts, evidence count

Current implementation:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L540)

**7. Streaming UX**
Current streaming output is isolated in its own panel.

Target:
- show streaming inline in the transcript as a live generation/progress row
- optionally retain a full stream inspector if needed
- do not force the user to look away from the main thread
- let streaming collapse after completion

Current implementation:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L418)

Logic to preserve:
- orchestrator streaming events from [MainOrchestrator.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/controller/MainOrchestrator.ts#L613)
- provider streaming posting from [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L134)

**8. File Review UX**
This is the most important interaction to improve.

Current problem:
- file review is detached into a side panel-like queue
- approval/rejection also creates extra assistant messages
- user attention is split

Target:
- file review appears as a transcript phase
- each file is rendered as a compact review row
- per-file approve/reject controls remain intact
- diff preview is collapsed by default
- file status is instantly visible
- approvals/rejections update inline, not as noisy extra rows unless necessary

Current behavior to preserve:
- `APPROVE_FILE_CHANGE`
- `REJECT_FILE_CHANGE`
- disabled controls after decision
- review completion summary

Current references:
- file review row rendering in [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L358)
- dynamic actions in [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L589)
- message contracts in [types.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/types.ts#L176)
- orchestrator file review flow in [MainOrchestrator.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/controller/MainOrchestrator.ts#L849)

**9. Patch Ready UX**
Current patch-ready moment is another large action card.

Target:
- render as a polished review milestone row
- include compact summary
- inline actions:
  - Review diff
  - Apply
  - Reject
- make it feel like the natural final step in the run
- do not over-explain

Current implementation:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L476)

**10. Error and Blocked UX**
Current blocked/error rendering works but is visually similar to other action cards.

Target:
- stronger severity hierarchy
- clear reason
- clear next action
- preserve visible offending beliefs when blocked
- use clean status iconography instead of emoji/glyphs
- keep restart/new-run option available

Current implementation:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L494)

**11. Empty States**
Current empty states are descriptive but generic.

Need polished empty states for:
- idle chat
- no audit yet
- no beliefs yet
- no file changes yet
- no stream yet

Tone:
- calm
- helpful
- concise
- not verbose

**12. Copywriting Pass**
The UI needs a copy pass as much as a layout pass.

Guidelines:
- fewer exclamation marks
- less “assistant announcement”
- more operator language
- clearer causal statements
- shorter button text
- stronger labels

Examples:
- “Belief Review Required” can stay conceptually, but wording should feel more integrated
- “Patch Ready” is good, but supporting text should be tighter
- “Changes rejected” should be shorter and calmer

**Recommended Component Model For The New UI**
Even if it stays in one file for now, the implementing agent should conceptually split the UI into these parts:

- Header
- Transcript container
- Composer
- Row renderer
- User task row
- System status row
- Assistant message row
- Belief review row
- Clarification form row
- File review row
- Patch summary row
- Blocked row
- Error row
- Inline details expander
- Inspector shell
- Audit inspector
- Belief inspector
- Files inspector

If the agent can safely modularize inside the webview script/markup without changing logic, that should be encouraged.

**Message/Event Mapping That Must Survive**
The redesign must preserve handling for:
- `TASK_SUBMITTED`
- `USER_ANSWERED`
- `APPROVE_FILE_CHANGE`
- `REJECT_FILE_CHANGE`
- `REVIEW_DIFF`
- `APPLY_PATCH`
- `REJECT_PATCH`

And rendering for:
- `BELIEFS_EXTRACTED`
- `BELIEF_GRAPH_UPDATED`
- `PROCESSING`
- `ASSISTANT_MESSAGE`
- `AUDIT_EVENT`
- `FILE_CHANGE_READY`
- `FILE_REVIEW_COMPLETE`
- `STREAMING_CHUNK`
- `PATCH_READY`
- `BLOCKED`
- `ERROR`

Contracts:
- [types.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/types.ts#L176)

The UI agent should treat these contracts as fixed inputs/outputs.

**Implementation Strategy**
Recommended execution order:

1. Refactor visual architecture first.
2. Remove emoji/glyph UI labels.
3. Establish header + transcript + composer layout.
4. Move file review and streaming into transcript-driven UX.
5. Demote audit and graph into inspectors.
6. Reduce duplication between chat and audit.
7. Tighten copy and status hierarchy.
8. Polish spacing, borders, chips, buttons, and scroll behavior.
9. Verify no logic or event flows regressed.
10. Run build/debug validation and visual sanity pass.

**Phased Delivery Plan**

**Phase 1: Structural Overhaul**
- Rebuild layout around transcript-first architecture.
- Introduce header and inspector model.
- Keep all current render pathways working.
- Preserve all current event handling.

Success criteria:
- transcript is the main experience
- audit/graph/files no longer dominate the page
- no functionality lost

**Phase 2: Interaction Cleanup**
- convert action cards into cleaner inline review rows
- streamline file review UX
- streamline streaming UX
- reduce chat duplication from audit mirroring

Success criteria:
- one guarded run reads cleanly from top to bottom
- no “stack of dashboard boxes” feel

**Phase 3: Native Polish**
- replace emojis with codicons/native icon treatment
- normalize buttons
- standardize badges/chips
- fix spacing rhythm
- fix copy tone
- fix encoding/glyph corruption issues

Success criteria:
- interface feels native and deliberate
- no broken glyphs
- no novelty styling

**Phase 4: Submission Hardening**
- visual QA in narrow sidebar widths
- light/dark theme checks with VS Code variables
- long message handling
- long file path handling
- many-audit-item handling
- many-file-review-item handling
- blocked/error path visual checks

Success criteria:
- no obvious visual failure cases
- polished enough for demo/judging

**Detailed Acceptance Criteria**

**Layout**
- one dominant transcript area
- sticky composer
- compact header
- secondary inspectors are subordinate

**Buttons**
- no emoji labels
- consistent primary/secondary/destructive treatments
- actions grouped logically
- destructive actions clearly distinct

**Transcript**
- every run appears as a coherent sequence
- rows have clear hierarchy and spacing
- review moments feel integrated, not bolted on

**Audit**
- still fully accessible
- no longer visually competes with main transcript
- details are expandable

**Belief Graph**
- still accessible
- more compact and readable
- grouped and scannable

**File Review**
- per-file approve/reject remains intact
- statuses update clearly
- previews are readable but not overwhelming

**Streaming**
- visible without leaving the main narrative
- no isolated dead panel feel

**Theme Compatibility**
- honors VS Code theme variables
- looks correct in dark and light themes
- no hardcoded bright colors that clash

**Robustness**
- no broken glyphs/encoding artifacts
- no overflow disasters on narrow width
- no action loss
- no missing message handlers

**Testing and Validation Checklist**
The implementing agent should verify all of these after the UI overhaul:

- `npm run compile` succeeds
- extension still loads in F5
- task submission works
- `hello` still produces graceful non-actionable behavior if applicable
- a real coding task still shows:
  - progress
  - beliefs
  - graph
  - audit
  - streaming
  - file review
  - patch review
- diff review still triggers correctly
- apply patch still triggers correctly
- reject patch still works
- file-level approve/reject still works
- blocked state still displays
- error state still displays
- chat scroll behavior remains usable
- long transcript remains usable
- long file paths do not break layout

**Known Logic Boundaries The UI Agent Must Respect**
Do not alter:
- bounded context expansion flow in [MainOrchestrator.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/controller/MainOrchestrator.ts#L658)
- streaming emission in [MainOrchestrator.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/controller/MainOrchestrator.ts#L621)
- file review sequencing in [MainOrchestrator.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/controller/MainOrchestrator.ts#L849)
- message types in [types.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/types.ts#L176) unless there is a truly UI-only extension and it is justified
- provider-posting methods in [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L107)

**Risks To Watch**
- accidentally changing behavior while refactoring the provider
- over-styling and losing native VS Code feel
- hiding too much diagnostic value
- creating a prettier UI that is actually less informative
- preserving card logic too literally and only changing colors
- introducing layout regressions in narrow sidebar widths
- spending too long polishing details before fixing structure

**Recommended Output From The UI Agent**
The UI agent owning this should deliver:
- a transcript-first redesigned webview
- emoji-free control system
- cleaner inspector model
- preserved functionality
- compile-clean implementation
- brief visual change summary
- note of any unavoidable compromises

**Definition Of Done**
This UI overhaul is done when:
- BeliefGuard visually reads as one guarded run, not five separate widgets
- all current functionality still works
- emoji-heavy UI is gone
- the extension feels native, deliberate, and polished
- the UI clearly communicates BeliefGuard’s core identity:
  - explicit beliefs
  - gating
  - evidence-aware execution
  - reviewed edits only

**One-Sentence Handoff Summary**
Rebuild the BeliefGuard webview into a transcript-first, VS Code-native, governance-oriented interface that preserves every current interaction and runtime contract while removing emoji-heavy, over-carded, fragmented presentation.
**Implementation Brief**
This is the execution brief for the agent who will own the BeliefGuard UI overhaul. It assumes:
- no logic changes
- no orchestration changes
- no thinkN changes
- no patch workflow changes
- no external repo code copied in
- UI-only redesign with behavior preservation

Primary implementation file:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts)

Contract file to preserve:
- [types.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/types.ts)

Logic files to treat as fixed:
- [MainOrchestrator.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/controller/MainOrchestrator.ts)
- [LLMClient.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/ai/LLMClient.ts)
- [ThinkNClient.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/beliefs/ThinkNClient.ts)

**1. Product Framing**
The UI must express BeliefGuard as:
- a governed coding workflow
- a belief-aware decision system
- a review-first execution controller

It must not feel like:
- a toy chatbot
- a dashboard of unrelated cards
- a generic agent clone
- a thin Cline imitation

The correct emotional tone is:
- calm
- exact
- trustworthy
- quietly technical
- native to VS Code

**2. Top-Level Layout Goal**
Rebuild the webview around four regions:
- header
- main transcript
- sticky composer
- secondary inspectors

The main transcript must become the dominant region.

The secondary inspectors must support the transcript, not compete with it.

The current stacked top-level sections that should be demoted are:
- file review queue
- streaming output
- audit timeline
- belief graph snapshot

Current stacked layout lives in:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L263)

**3. Header Redesign Instructions**
Replace the current minimal header with a compact operational header.

The header must include:
- product name: `BeliefGuard`
- run status chip
- current phase text
- compact inspector toggles or segment controls for `Run`, `Audit`, `Beliefs`, `Files`

The header must not include:
- decorative emoji
- oversized shield art
- hackathon-style novelty styling

The header should visually communicate:
- idle
- processing
- clarification needed
- reviewing files
- patch ready
- blocked
- error
- completed

The header must stay short enough that the transcript still feels primary.

**4. Transcript System Redesign**
The current `appendMessage()` model should evolve from generic “message card” rendering into a row system.

Current base render point:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L317)

The transcript should support these row classes conceptually:
- user task row
- assistant explanation row
- system progress row
- belief review row
- clarification row
- file review row
- patch summary row
- blocked row
- error row
- run completion row

Each row should have:
- compact top line
- optional icon
- title or phase label
- body content
- optional metadata
- optional inline actions
- optional expandable details

Rows should differ in role and severity, not by arbitrary card variety.

**5. User Task Row Instructions**
The user task row should be:
- compact
- clearly right-aligned or visually distinct
- easy to skim
- stable across long prompts

It should not use decorative UI tricks.

It should feel like the start of a run log.

**6. Assistant Narrative Row Instructions**
Assistant narrative rows should become cleaner and more editorial.

They should:
- explain what is happening
- summarize state
- avoid excessive framing
- avoid repeating what the audit panel already says
- use compact typography

They should not:
- look like giant cards
- compete visually with review rows
- echo every internal diagnostic

**7. System Progress Row Instructions**
System progress rows should become the default way to show movement through the pipeline.

These rows should be used for:
- starting run
- gathering context
- extracting beliefs
- grounding
- gate evaluation
- context expansion
- patch generation
- validation
- file review completion

Current processing events are injected through:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L96)
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L656)

These rows should look like:
- slim milestone rows
- not big action cards
- lightly stylized
- chronologically clear

**8. Belief Review Row Instructions**
Current belief review rendering:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L446)

This should become a first-class transcript milestone row.

It must contain:
- clear gate-paused state
- count of blocking beliefs
- count of required questions
- compact list of unresolved blocking beliefs
- inline question controls
- one clear submit action
- one secondary “open beliefs” action

The row should emphasize:
- why the run paused
- what the user must answer
- what will happen after answer submission

The row should not:
- feel like a modal in the middle of the chat
- include too many chips
- visually duplicate the full belief graph

**9. Clarification Controls Instructions**
Clarification controls should stay embedded where the user is already reading.

Radio options and text inputs should be:
- clean
- aligned
- readable in narrow widths
- clearly associated with the belief statement

When answers are submitted:
- show one compact confirmation row
- then return to progress flow
- avoid noisy extra chatter

Current answer collection:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L574)

**10. File Review Experience Instructions**
Current detached review panel:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L270)
- file card rendering at [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L358)

This is the most important redesign area.

New model:
- file review should appear as a transcript phase called something like `Review file changes`
- each file is a compact inline review item
- items must show:
  - path
  - action/status
  - additions/deletions
  - short diff preview
  - approve/reject controls
- diff preview should be collapsed or visually compact by default
- approving/rejecting should update status inline
- avoid spawning unnecessary assistant rows after each file decision unless needed

Preserve:
- `APPROVE_FILE_CHANGE`
- `REJECT_FILE_CHANGE`
- per-file disabled controls after decision
- review completion summary

Current message contract:
- [types.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/types.ts#L176)

**11. Patch Summary Row Instructions**
Current patch-ready card:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L476)

Redesign into a polished transcript row that contains:
- patch milestone title
- short explanatory sentence
- compact file summary list
- inline actions:
  - `Review diff`
  - `Apply`
  - `Reject`

This row should feel like the final approval checkpoint in a governed workflow.

It should not feel like a separate app section.

**12. Streaming UX Instructions**
Current streaming panel:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L277)
- stream append logic at [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L418)

Streaming should move into the transcript as:
- a live system or assistant generation row
- progressively updated content
- collapsible long output if needed

Optional:
- keep a stream inspector for full raw output

But the primary live experience should be inline.

**13. Audit Inspector Instructions**
Current audit rendering:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L499)

Audit should become a secondary inspector.

It should:
- remain fully accessible
- show chronological run trace
- keep details expansion
- be compact and scan-friendly
- use phase labels and timestamps well

It should not:
- dominate the page
- duplicate the whole transcript
- mirror too many events back into chat

Chat mirroring should be reduced to milestone-level events.

Current mirroring rule:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L519)

That rule should be tightened.

**14. Belief Inspector Instructions**
Current graph rendering:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L540)

Beliefs should be available in a dedicated inspector view.

Each belief item should show:
- statement
- risk
- confidence
- validation state
- conflicts count
- evidence count

Grouping by belief type can remain.

The presentation should become:
- less border-heavy
- more data-dense
- more readable
- less “box in box in box”

**15. Files Inspector Instructions**
A supporting files inspector should exist for:
- file review queue state
- applied/rejected summary
- compact visibility into all file changes

This inspector can echo the transcript review state in a compact utility form.

It should not be the primary action surface.

**16. Composer Instructions**
Current composer:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L264)

Redesign goals:
- sticky bottom placement
- better internal spacing
- cleaner textarea styling
- codicon or native button treatment
- concise placeholder
- optional shortcut hint
- clear disabled/loading state

Remove:
- emoji submit label
- noisy placeholder punctuation
- anything that feels playful rather than deliberate

**17. Button System Instructions**
Create a clean action hierarchy.

Buttons should exist in three roles:
- primary
- secondary
- destructive

Primary is for:
- submit task
- submit answers
- apply final approved patch when that moment is primary

Secondary is for:
- review diff
- open beliefs
- open audit
- restart or inspect actions

Destructive is for:
- reject file
- reject patch

Buttons must:
- have consistent spacing
- consistent radius
- consistent height
- no emoji
- no broken glyphs
- readable labels

**18. Codicon Usage Instructions**
Use codicons or native VS Code icon styling instead of emoji.

Recommended icon mapping:
- submit task: `send`
- audit: `history`
- beliefs/graph: `graph` or `symbol-structure`
- files: `files`
- review diff: `diff`
- apply: `check`
- reject: `close`
- blocked/warning: `warning` or `error`
- success: `pass` or `check`

Icons should be:
- subtle
- consistent
- never noisy
- always paired with text for important actions

**19. Typography Instructions**
Use VS Code theme typography variables where possible.

Hierarchy:
- product title
- row title
- body text
- metadata
- chips/badges

Goals:
- fewer all-caps labels
- more readable metadata
- stronger contrast between title and detail
- less tiny utility-text overload

**20. Spacing Instructions**
The current UI feels cramped in places and oversized in others.

Adopt a spacing rhythm such as:
- small gap for metadata
- medium gap between text and actions
- larger gap between transcript rows
- compact internal padding on utility rows

Goal:
- cleaner breathing room
- less card density
- smoother scan path

**21. Surface and Border Instructions**
Right now nearly every element is boxed.

Reduce borders dramatically.

Use:
- subtle surface differences
- occasional border only where structural
- accent color only for important state changes
- chip/badge treatments instead of more boxes

High-severity rows may retain stronger border or side accent, but this should be the exception.

**22. Color and State Instructions**
Use VS Code theme tokens first.

State colors should express:
- info
- success
- warning
- blocked/error

Avoid:
- bright custom palette overload
- clashing colors
- heavy tinted fills everywhere

BeliefGuard should feel restrained.

**23. Empty State Instructions**
Design empty states for:
- idle transcript
- audit inspector
- beliefs inspector
- files inspector
- streaming state if retained as inspector

Each empty state should:
- be short
- explain purpose
- suggest the next action

Avoid long instructional paragraphs.

**24. Copywriting Instructions**
Do a full UI copy pass.

Tone rules:
- concise
- calm
- operational
- clear next step
- not salesy
- not overexcited

Good examples of desired tone:
- `Run paused pending clarification`
- `Review file changes before applying`
- `Patch generated and validated`
- `Run blocked by conflicting constraints`

Avoid:
- emoji enthusiasm
- overly verbose warnings
- repetitive “BeliefGuard” narration in every surface

**25. Accessibility Instructions**
Ensure:
- buttons have clear text labels
- icons are not meaning-only
- focus states are visible
- inspector toggles are keyboard-usable
- textarea and inputs remain labeled
- long transcript remains navigable
- details/expanders are accessible

**26. Responsive Sidebar Instructions**
This webview lives in a narrow column. Optimize for that explicitly.

Must handle:
- long file paths
- long belief statements
- long assistant messages
- many audit events
- many file review items

Avoid:
- horizontal overflow
- action rows that wrap into chaos
- over-wide chip clusters

**27. Encoding Cleanup Instructions**
Current file visibly contains broken glyph artifacts.
Those must be removed as part of the overhaul.

Examples appear in current rendered labels and comments in:
- [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts#L267)

The final UI must contain:
- plain ASCII-safe labels where possible
- clean icon rendering
- no garbled characters

**28. Suggested Internal Refactor Approach**
Even if staying inside one provider file, the UI agent should internally separate concerns by creating clearer render functions for:
- base row creation
- status row creation
- review row creation
- file item creation
- inspector rendering
- header state updates
- transcript state management

That will make the provider easier to maintain without changing logic.

**29. What Must Not Change**
Do not change:
- event semantics
- provider public posting methods
- orchestrator flow
- gate behavior
- file approval logic
- patch apply/review commands
- thinkN diagnostics pipeline
- message types in [types.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/types.ts#L176) unless absolutely necessary

**30. Visual Definition Of Success**
The final UI should make a first-time viewer understand:
- this tool reasons before editing
- this tool pauses when uncertain
- this tool surfaces beliefs and validation
- this tool lets the user review before edits land

If a judge or teammate looks at the extension for 30 seconds, they should understand the product story without needing architecture docs.

**Priority-Ranked Task Checklist**

**Phase A: Protect Scope**
1. Confirm the redesign is UI-only and that all message/event contracts remain unchanged.
2. Identify the exact render/action functions in [BeliefGuardProvider.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/webview/BeliefGuardProvider.ts) that will be reshaped.
3. Treat [types.ts](/c:/Users/cause/Downloads/BeliefGuard/Startup-Village-Hackathon/BeliefGuard/src/types.ts) as fixed contract input/output.

**Phase B: Remove Visual Debt First**
4. Remove all emoji and broken glyph labels from buttons, summaries, helper text, and action copy.
5. Replace them with codicons or clean text labels.
6. Normalize primary, secondary, and destructive button treatments.
7. Clean up garbled encoding artifacts across the entire webview template.

**Phase C: Rebuild The Skeleton**
8. Replace the current stacked-panel layout with a header, main transcript, sticky composer, and secondary inspector structure.
9. Make the transcript the visually dominant area.
10. Make inspectors subordinate and collapsible or toggleable.
11. Keep the composer fixed and stable at the bottom.

**Phase D: Redesign The Header**
12. Implement compact product header with status chip and phase text.
13. Add inspector toggles or controls for `Run`, `Audit`, `Beliefs`, and `Files`.
14. Make header calm and compact.
15. Ensure the header updates cleanly as runtime state changes.

**Phase E: Redesign The Transcript**
16. Replace generic card rendering with a row-based transcript model.
17. Create distinct row treatments for user, assistant, system, review, blocked, and error states.
18. Reduce visual weight of standard narrative rows.
19. Make milestone rows readable at a glance.

**Phase F: Redesign Belief Review**
20. Rebuild `renderBeliefReview()` as an inline gated review row rather than a heavy card.
21. Show blocking beliefs in compact form.
22. Keep clarification inputs embedded inside the row.
23. Keep the `submit answers` action obvious.
24. Add a low-emphasis route to open the full beliefs inspector.

**Phase G: Redesign File Review**
25. Move file review into the transcript as a first-class review phase.
26. Rework file items to be compact, readable, and decision-oriented.
27. Preserve approve/reject behavior exactly.
28. Update file status inline after a decision.
29. Reduce or remove extra assistant chatter after each file decision if not required.
30. Keep a supporting files inspector for overview if useful.

**Phase H: Redesign Patch Approval**
31. Rebuild `renderPatchReady()` as a polished milestone row.
32. Keep summary compact and scannable.
33. Keep `Review diff`, `Apply`, and `Reject` actions intact.
34. Make this feel like the final checkpoint of a governed run.

**Phase I: Redesign Streaming**
35. Move primary streaming feedback into the transcript as a live-updating row.
36. Optionally keep a secondary stream inspector only if it adds real value.
37. Ensure long stream text does not overwhelm the thread.
38. Collapse or tone down completed stream output.

**Phase J: Demote Diagnostics Into Inspectors**
39. Rebuild audit as a compact inspector, not a competing main panel.
40. Rebuild beliefs as a compact inspector, not a wall of graph cards.
41. Add or refine a files inspector for compact review state.
42. Reduce audit-to-chat mirroring so only key milestones appear in the transcript.

**Phase K: Polish Visual Language**
43. Tighten spacing rhythm across rows, actions, chips, and inspectors.
44. Reduce unnecessary borders and nested boxes.
45. Standardize chips, badges, and metadata styling.
46. Improve typography hierarchy for row title, body, and metadata.
47. Tune color/state usage to feel restrained and native to VS Code.

**Phase L: Polish Copy**
48. Rewrite verbose helper copy into shorter operational text.
49. Ensure every major state explains what is happening and what happens next.
50. Remove repetitive narration that clutters the transcript.
51. Make blocked/error/review wording feel more professional and calm.

**Phase M: Verify No Regression**
52. Verify all existing message handlers still fire and render correctly.
53. Verify task submission still works.
54. Verify clarification submission still works.
55. Verify file approve/reject still works.
56. Verify patch review/apply/reject still works.
57. Verify blocked and error flows still render properly.
58. Verify audit, beliefs, and files remain accessible.

**Phase N: Runtime Validation**
59. Run compile and confirm no webview/template issues.
60. Launch F5 and test an idle state.
61. Submit a simple task and confirm transcript flow works.
62. Submit a task that triggers belief clarification.
63. Submit a task that triggers streaming.
64. Submit a task that triggers file review.
65. Submit a task that reaches patch-ready.
66. Verify diff review command still opens properly.
67. Verify apply path still works.
68. Verify narrow sidebar layout remains clean.

**Phase O: Submission Hardening**
69. Review the extension in dark theme.
70. Review the extension in light theme.
71. Stress test long file paths and long belief text.
72. Stress test many audit events.
73. Stress test multiple file review items.
74. Remove any lingering prototype-looking styling.
75. Prepare a concise visual change summary for the team.

**Final Handoff Deliverable Expected From The UI Agent**
76. A compile-clean UI overhaul in the BeliefGuard webview.
77. No logic regressions.
78. No emoji-driven controls.
79. A transcript-first run experience.
80. Clear secondary inspectors for diagnostics.
81. A short note listing:
- what changed visually
- what was intentionally preserved
- any limitations still remaining

