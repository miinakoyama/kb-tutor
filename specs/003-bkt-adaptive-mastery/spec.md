# Feature Specification: BKT Adaptive Mastery

**Feature Branch**: `003-bkt-adaptive-mastery`

**Created**: 2026-07-10

**Status**: Ready for Planning

**Input**: User description: "Implement Bayesian Knowledge Tracing (BKT) with aggregate cold-start mastery, KC-level response updates, adaptive Practice selection, fixed Exam selection, Review updates, multi-part constructed-response handling, and a safe policy for existing questions without KC assignments."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build Trustworthy KC Coverage (Priority: P1)

An administrator can see whether every eligible question has valid Knowledge Component (KC) coverage, run an auditable automated classification for existing untagged MCQs, inspect disagreements or failures, and publish only valid assignments for adaptive use.

**Why this priority**: BKT updates and adaptive selection are not meaningful unless each scored response can be attributed to a valid KC. Incorrect silent mappings would corrupt every later mastery estimate.

**Independent Test**: Load a mixed bank of tagged, untagged, invalidly tagged, and multi-part questions; verify that the coverage report identifies each state and that only confirmed, valid mappings become eligible for adaptive Practice.

**Acceptance Scenarios**:

1. **Given** an existing MCQ without a KC, **When** an automated classification run executes, **Then** the MCQ is classified twice independently using only KCs in its standard and both decisions, rationales, classifier versions, and source-content version are retained.
2. **Given** both independent decisions select the same valid KC, **When** the run is approved for publication, **Then** the assignment is marked model-confirmed and becomes eligible for that KC without altering question content or prior attempt records.
3. **Given** the two decisions disagree, the question is ambiguous, or validation fails, **When** the run completes, **Then** the MCQ remains unresolved and excluded from adaptive Practice until it is reclassified or corrected.
4. **Given** an authorized administrator identifies an incorrect model-confirmed assignment, **When** the assignment is corrected or withdrawn, **Then** future observations use the corrected version while prior audit events retain the version used when scored.
5. **Given** a Short Answer Question (SAQ), **When** its coverage is validated, **Then** every scored part has exactly one valid KC within the question's standard, while different parts may use different KCs or repeat the same KC.
6. **Given** an unresolved question remains in the bank, **When** a student starts adaptive Practice, **Then** the question is excluded from adaptive selection and the session continues using mapped questions without error.
7. **Given** a standard has unmastered KCs but no eligible mapped questions, **When** the coverage state is evaluated, **Then** administrators can see the blocking gap and students are not falsely told that the standard is mastered.

---

### User Story 2 - Maintain Student Mastery from Responses (Priority: P1)

A student's mastery probability is initialized consistently for every KC and changes after each scored response in Practice, Exam, and Review, using response-format-specific BKT parameters.

**Why this priority**: Persistent and reproducible KC mastery is the foundation for both adaptivity and later progress reporting.

**Independent Test**: Start a student with no BKT state, submit known correct and incorrect MCQ and SAQ observations, and verify the resulting KC probabilities, mastery status, and update history against agreed examples.

**Acceptance Scenarios**:

1. **Given** a new student or an existing student with no BKT state, **When** a KC is first needed, **Then** its mastery starts at the aggregate prior of 0.30; no pre-test, student-specific fitting, or historical-attempt replay is required in version 1.
2. **Given** a correct MCQ response for one KC, **When** it is scored, **Then** only that KC receives one observation using guess rate 0.25, slip rate 0.10, and learning rate 0.10.
3. **Given** an incorrect MCQ response for one KC, **When** it is scored, **Then** only that KC receives one incorrect observation using the MCQ parameter set.
4. **Given** a scored SAQ with parts assigned to multiple KCs, **When** a part attempt is scored, **Then** its assigned KC receives one observation using guess rate 0.10, slip rate 0.10, and learning rate 0.10; full credit is correct and any lower score is incorrect.
5. **Given** a scored response in Exam or Review, **When** it is finalized, **Then** it updates KC mastery exactly as a comparable Practice response even though BKT does not choose the Exam or Review question.
6. **Given** a retry or duplicate delivery event, **When** the same scored observation is received more than once, **Then** it changes mastery at most once; a genuinely new Review re-attempt remains a new observation.
7. **Given** a KC probability reaches or exceeds 0.95, **When** mastery status is evaluated, **Then** that KC is marked mastered and is retired from adaptive Practice selection unless a later scored response lowers it below 0.95.
8. **Given** any mastery change, **When** it is inspected, **Then** the prior probability, response outcome, question format, parameters, resulting probability, source mode, question/part identity, and time are available for audit.

---

### User Story 3 - Receive Adaptive MCQ Practice (Priority: P1)

A student practicing a selected standard first encounters its KCs in a stable curriculum order, then receives interleaved questions that favor the highest-probability unmastered KCs while keeping weaker KCs in rotation.

**Why this priority**: This is the primary learner-facing benefit of BKT and turns mastery estimates into efficient practice.

**Independent Test**: Use a standard with five mapped KCs and a known response sequence; verify first-pass order, later prioritization, retirement at 0.95, interleaving, weak-KC inclusion, and coverage-gap behavior.

**Acceptance Scenarios**:

1. **Given** all KCs in the selected standard are unseen by the student, **When** Practice begins, **Then** the system serves one eligible MCQ for each KC in the catalog's fixed external order before mastery-driven ranking begins.
2. **Given** some KCs have been observed and others have not, **When** the first pass resumes, **Then** unseen KCs retain first-pass priority in fixed order; prior sessions do not reset the pass.
3. **Given** the first pass is complete, **When** the next KC is selected, **Then** mastered KCs are excluded and the highest-probability unmastered KCs receive the strongest priority.
4. **Given** strong and weak unmastered KCs coexist, **When** several questions are served, **Then** questions are interleaved and the configured cap prevents repeated selection from one KC while weak KCs receive a bounded share of opportunities.
5. **Given** multiple eligible questions target the chosen KC, **When** a question is selected, **Then** the system avoids an immediate repeat when another suitable question exists and uses a stable tie-breaking rule that does not expose content order as a mastery signal.
6. **Given** every KC in the selected standard is mastered, **When** Practice evaluates continuation, **Then** the standard is complete and no further adaptive question is served for it.

---

### User Story 4 - Practice Multi-KC Short Answers (Priority: P1)

A student whose next target is a specific KC receives an eligible SAQ from the question bank whose parts include that KC, while the other parts provide valid additional evidence for their own KCs.

**Why this priority**: Existing SAQs already have part-level KC mappings, so bank selection can target the chosen KC without requiring KC-targeted generation.

**Independent Test**: Use a bank containing SAQs with overlapping KC combinations; choose a target KC and verify that every selected item contains it, unseen and broader unmastered-KC coverage is preferred, each part updates its own KC, and a missing target is reported as a coverage gap.

**Acceptance Scenarios**:

1. **Given** A2 is the next target KC, **When** SAQ candidates are assembled, **Then** every candidate contains A2 in at least one scored part and belongs to the active practice scope.
2. **Given** multiple unseen SAQs contain A2, **When** one is selected, **Then** an unseen item that also covers the greatest number of other unmastered KCs is preferred, with recency and stable ordering used as subsequent tie breakers.
3. **Given** all A2 SAQs have been answered, **When** another A2 item is needed, **Then** the least recently answered eligible A2 SAQ is selected while avoiding an immediate repeat when possible.
4. **Given** a selected SAQ maps its parts to A2, A3, and A4, **When** the parts are scored, **Then** A2, A3, and A4 each update from their own part outcomes even though A2 caused the item to be selected.
5. **Given** no eligible SAQ contains A2, **When** selection runs, **Then** A2 is recorded as an SAQ coverage gap and selection falls through to the next prioritized unmastered KC that has an eligible SAQ; an unrelated item is not presented as A2 practice.
6. **Given** an SAQ contains A2 in multiple parts, **When** it is selected, **Then** repeated A2 coverage does not outrank an otherwise equivalent item merely because it would create more A2 observations.
7. **Given** every KC in the standard is at or above 0.95, **When** SAQ continuation is evaluated, **Then** no additional SAQ is served for that standard.

---

### User Story 5 - Preserve Exam and Review Workflows (Priority: P2)

A student takes fixed-blueprint Exams and uses the existing Review queue without BKT changing those question choices, while every newly scored response still improves the student's KC state for future learning.

**Why this priority**: BKT must add useful evidence without compromising assessment coverage or the established spaced-review experience.

**Independent Test**: Run identical Exam and Review selection scenarios before and after enabling BKT; verify the chosen questions and queue rules are unchanged while mapped responses create mastery updates.

**Acceptance Scenarios**:

1. **Given** an Exam blueprint, **When** the Exam is assembled, **Then** its fixed coverage rules determine the questions without consulting student mastery.
2. **Given** a student answers a mapped Exam question incorrectly, **When** the result is finalized, **Then** the KC probability updates and can affect the next Practice session.
3. **Given** a student has no review history, mistakes, or bookmarks, **When** Review opens, **Then** all existing filters show empty sets and an English empty state is displayed without error.
4. **Given** a Review queue exists, **When** the next item is selected, **Then** existing spacing, mistake, and bookmark rules control inclusion and timing; BKT does not replace them.
5. **Given** a mastered KC has old mistakes and bookmarks, **When** Review is prepared, **Then** eligible past mistakes may auto-retire under existing rules while bookmarks remain until the student removes them.

### Edge Cases

- A question points to a KC that no longer exists, belongs to a different standard, or is inactive.
- A question's KC mapping changes after students have already answered it; past audit records retain the KC used at scoring time and are not silently rewritten.
- Two or more KCs have identical mastery, eligibility, and rotation state; selection remains deterministic enough to test while avoiding repeated delivery of the same item.
- A selected KC has no unused mapped MCQ, or all of its eligible items were recently seen.
- A target KC has no eligible SAQ even though other SAQs exist in the same standard.
- An SAQ contains the target KC in two or three parts, which creates multiple sequential observations from one item but does not increase its selection priority.
- A student leaves during the first pass and resumes on another device; first-pass progress is preserved.
- A response is rescored after grading correction; the prior observation must be replaced or recomputed rather than appended as extra evidence.
- An SAQ part is unscored, receives partial credit, or multiple parts share one KC.
- A KC crosses 0.95 and later falls below it after an Exam or Review miss; it returns to adaptive Practice eligibility.
- A standard's KC catalog changes after students already have mastery records; new KCs start at 0.30 and removed KCs no longer block completion.
- The student has mastery state but no currently accessible question bank for the relevant standard.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST maintain an authoritative KC catalog with a unique code, statement, standard, fixed order, and active status for every KC available to BKT.
- **FR-002**: Each adaptive-eligible MCQ MUST have exactly one confirmed active KC belonging to the MCQ's standard.
- **FR-003**: Each scored SAQ part MUST have exactly one confirmed active KC belonging to the SAQ's standard; an SAQ MAY contain multiple distinct KCs and MAY repeat a KC across parts.
- **FR-004**: The system MUST classify question coverage as valid, unresolved, invalid, or confirmed and MUST provide administrators counts and item-level details by format, source, and standard.
- **FR-005**: The legacy MCQ migration MUST classify every targeted question twice independently, constrain both decisions to active KCs in the question's standard, and retain each decision, rationale, classifier and prompt version, run identity, and source-content version.
- **FR-006**: Matching valid decisions MAY become model-confirmed only through an explicit publication step; disagreements, invalid outputs, ambiguous questions, and changed source content MUST remain unresolved. Authorized administrators MUST be able to replace, withdraw, or leave unresolved an assignment and filter all coverage gaps.
- **FR-007**: Unresolved or invalidly mapped questions MUST remain available only in non-adaptive contexts whose existing rules permit them; they MUST NOT contribute BKT observations or be selected by adaptive Practice.
- **FR-008**: New or edited questions MUST pass KC coverage validation before they become eligible for adaptive Practice.
- **FR-009**: Version 1 MUST initialize every student's first state for every active KC at aggregate P(L0) = 0.30, including students who existed before rollout but have no BKT state for that KC.
- **FR-010**: Version 1 MUST NOT require a pre-test, per-student prior fitting, group-specific prior, or replay of attempts that predate BKT activation.
- **FR-011**: The MCQ parameter set MUST be P(G) = 0.25, P(S) = 0.10, and P(T) = 0.10.
- **FR-012**: The SAQ parameter set MUST be P(G) = 0.10, P(S) = 0.10, and P(T) = 0.10.
- **FR-013**: The system MUST apply standard BKT by first conditioning the current mastery probability on the binary response and then applying the learning transition P(T) after every observation. With the version-1 parameters, an MCQ starting at 0.30 becomes approximately 0.646 after a correct response and approximately 0.149 after an incorrect response.
- **FR-014**: Every accepted observation MUST update only its mapped KC, clamp the resulting probability to the valid 0-to-1 range, and preserve sufficient input and output data to reproduce the update.
- **FR-015**: An MCQ answer MUST contribute exactly one binary correct/incorrect observation after final scoring.
- **FR-016**: Every scored SAQ part attempt MUST contribute one sequential observation to its assigned KC. Full credit MUST be treated as correct and any lower score MUST be treated as incorrect. Multiple parts assigned to the same KC and genuine re-attempts MUST each contribute separate observations in scoring order.
- **FR-017**: Responses finalized in Practice, Exam, and Review MUST update mastery; question selection in Exam and Review MUST remain independent of BKT.
- **FR-018**: The system MUST prevent duplicate delivery or retry events for one scored attempt from applying the same observation more than once.
- **FR-019**: A corrected or rescored attempt MUST produce the same current mastery as if only the final outcome had been recorded, without double counting the earlier outcome.
- **FR-020**: A KC MUST be considered mastered at P(L) >= 0.95 and unmastered below 0.95; later evidence MAY reverse mastered status.
- **FR-021**: Adaptive MCQ Practice MUST complete a persistent first pass by serving each unseen, eligible KC in the selected standard once in fixed catalog order before mastery-based selection.
- **FR-022**: After the first pass, adaptive MCQ Practice MUST exclude mastered KCs and prioritize the highest-P(L) unmastered KCs.
- **FR-023**: After the first pass, adaptive MCQ Practice MUST use a repeating three-opportunity cycle: the first two opportunities select the highest-P(L) eligible unmastered KCs, and the third selects the least recently served eligible unmastered KC. No KC may appear more than twice consecutively when another eligible KC exists.
- **FR-024**: Within either selection lane, ties MUST be resolved by least recent KC exposure, then fixed KC catalog order. This rule MUST make selection reproducible from the recorded rotation state.
- **FR-025**: Within the chosen KC, the system MUST prefer an eligible question the student has not yet answered, then the least recently answered eligible question. If the KC has no eligible question, selection MUST fall through to the next KC under the same lane's ordering without consuming that opportunity.
- **FR-026**: Adaptive selection MUST avoid immediately repeating the same question when another eligible question for the selected KC is available.
- **FR-027**: A standard MUST be complete only when all currently active KCs in that standard are at or above 0.95; missing question coverage MUST NOT be interpreted as mastery.
- **FR-028**: When SAQ Practice targets a KC, its candidate bank MUST contain only eligible SAQs with at least one scored part assigned to that target KC.
- **FR-029**: Within the target-KC SAQ candidates, selection MUST prefer unattempted items, then items covering the greatest number of distinct additional unmastered KCs, then the least recently answered item, then a stable final tie breaker. Repeating the target KC across multiple parts MUST NOT by itself increase priority.
- **FR-030**: Exam assembly MUST continue to use its fixed blueprint and coverage rules without mastery-driven question choice.
- **FR-031**: Review MUST continue to use its existing mistake, bookmark, randomization, and spacing behavior; BKT MUST only consume scored Review outcomes.
- **FR-032**: Review MUST render an English empty state rather than an error when history-based filters have no entries.
- **FR-033**: The system MUST retain an auditable mastery event history including student, KC, prior and resulting probabilities, binary outcome, format, mode, parameter version, question and part identity when applicable, attempt identity, and event time.
- **FR-034**: KC mappings and BKT parameter sets MUST be version-identifiable so later catalog or parameter changes do not make historical events ambiguous.
- **FR-035**: A student's mastery data MUST be accessible only to that student and authorized educators or administrators who already have permission to view that student's learning data.
- **FR-036**: Adaptive Practice MUST fail gracefully when no mapped question is available, preserve the student's mastery state, and distinguish content-coverage limitations from mastery completion.
- **FR-037**: Version 1 MUST use the standard no-forgetting BKT model, equivalent to P(F) = 0, and MUST NOT reduce mastery solely because time passes or another response opportunity occurs.
- **FR-038**: Information-gain selection and individualized or group-specific priors MUST remain out of scope for version 1.
- **FR-039**: Every adaptive selection MUST record enough decision context to identify the cycle lane, eligible KC candidates, chosen KC and question, tie breaker or fallback used, and relevant mastery and recency state so the version-1 policy can be evaluated against a future alternative.
- **FR-040**: If no eligible SAQ contains the target KC, the system MUST record an SAQ coverage gap and fall through to the next prioritized unmastered KC with an eligible SAQ; it MUST NOT label an unrelated SAQ as practice for the missing target.
- **FR-041**: An SAQ MUST remain ineligible after all active KCs in its parts are mastered, and SAQ Practice MUST stop for a standard when all active KCs in that standard reach 0.95.
- **FR-042**: Legacy MCQ classification MUST support a non-writing preview that reports proposed assignments, disagreements, invalid cases, expected publication counts, and classification usage before any production assignment changes.
- **FR-043**: Legacy MCQ classification and publication MUST be idempotent, resumable after partial failure, restricted from sending student or attempt data to the classifier, and reversible by assignment version without modifying question content.
- **FR-044**: Migration publication MUST be staged by learning priority: current Self Practice questions first, beginning with a small representative validation sample, followed by remaining Self Practice questions and then questions limited to non-adaptive modes.
- **FR-045**: Adaptive Practice MUST be enabled per standard only after its eligible bank passes KC validity and coverage checks; publishing some standards MUST NOT require migration of every legacy question.
- **FR-046**: Newly generated or edited MCQs MUST include one valid KC before adaptive publication, and newly generated or edited SAQs MUST retain one valid KC per scored part, preventing new unresolved content from entering the adaptive bank.
- **FR-047**: The legacy bundled initial question bank MUST be retired from active student, educator, content-management, and fallback question pools; environments with no accessible question service MUST show an English empty or configuration state instead of silently loading bundled questions.

### Key Entities

- **Knowledge Component**: A uniquely coded, ordered, active or inactive unit of knowledge belonging to one standard and described by a learner-facing or educator-facing statement.
- **Question-KC Assignment**: The confirmed relationship between an MCQ and one KC, or between an SAQ part and one KC; includes assignment status, provenance, and version context.
- **Classification Run**: A versioned, previewable legacy-migration execution containing its target scope, independent classifier decisions, usage, validation results, publication state, and source-content versions.
- **KC Classification Decision**: One constrained proposed KC assignment for a legacy MCQ, including its rationale and classifier context; two matching valid decisions are required for model confirmation.
- **Student KC Mastery**: The student's current probability and mastered/unmastered status for one KC, together with the latest applied event and parameter version.
- **Mastery Observation**: One accepted correct or incorrect piece of evidence tied to a student, KC, scored attempt, format, mode, and question or part.
- **Mastery Event**: The immutable audit representation of a mastery transition, including its prior state, evidence, parameters, and resulting state.
- **Adaptive Rotation State**: Per-student progress through a standard's first pass plus recent KC and question exposure needed for interleaving and tie breaking.
- **BKT Parameter Set**: A versioned group of initial mastery, learning, guess, slip, and mastery-threshold values applicable to a question format.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Before adaptive Practice is enabled for a question bank, 100% of eligible MCQs have exactly one confirmed valid KC and 100% of scored SAQ parts have exactly one confirmed valid KC.
- **SC-002**: For a validation suite of at least 100 known response sequences across MCQ and SAQ formats, 100% of resulting mastery probabilities match the approved calculation examples within 0.001.
- **SC-003**: Across duplicate, retry, and rescore test scenarios, 100% of attempts produce the same final mastery as one application of the final accepted evidence.
- **SC-004**: In first-pass tests across every active standard, each eligible KC appears once in the declared external order before any KC receives a second adaptive MCQ.
- **SC-005**: In post-first-pass simulations of at least 50 selections with both strong and weak unmastered KCs, 100% of selections obey the two-consecutive cap and every eligible weak KC receives a rotation opportunity before the same weak KC receives a second rotation opportunity.
- **SC-006**: A KC is excluded from the next adaptive selection within one completed response after crossing 0.95 and becomes eligible again within one completed response after falling below 0.95.
- **SC-007**: 100% of finalized mapped responses in Practice, Exam, and Review create exactly the expected mastery evidence without changing Exam blueprint selection or Review queue inclusion rules.
- **SC-008**: Students can leave and resume a first pass on another supported device without losing completed-KC progress in 100% of continuity tests.
- **SC-009**: When a standard has no usable mapped question for a target KC, students receive a clear English non-completion or fallback outcome within the normal bounded session and no infinite selection loop occurs.
- **SC-010**: Authorized administrators can identify all unresolved and invalid mappings for a standard in no more than three navigation actions and can distinguish coverage gaps from mastered completion.
- **SC-011**: In acceptance testing, at least 90% of participating students complete an adaptive Practice session without reporting confusing repetition or being unable to understand why the session stopped.
- **SC-012**: Every sampled mastery change can be reproduced from its audit record, including the original parameter version and KC assignment, in 100% of a 200-event audit sample.
- **SC-013**: Every sampled adaptive selection can be reproduced or explained from its recorded decision context in 100% of a 200-selection audit sample.
- **SC-014**: In a validation suite covering every target-KC position across two-part and three-part SAQs, 100% of selected SAQs contain the requested target KC and every missing-target case follows the documented fallback.
- **SC-015**: A repeated legacy-classification run over unchanged questions produces no duplicate assignments and the same classification state for 100% of deterministic validation cases.
- **SC-016**: Before the first bulk publication, a representative preview of at least 20 legacy MCQs reports classification agreement, invalid or ambiguous cases, and measured classification usage; no production assignment changes occur during the preview.
- **SC-017**: After retirement, zero active application workflows load questions from the legacy bundled initial bank, and missing remote content produces a deliberate empty or configuration state.

## Assumptions

- The KC table supplied for Short Answer content becomes the initial authoritative KC catalog and its order within each standard is the fixed first-pass order.
- A read-only inventory on 2026-07-10 found 905 legacy MCQs without KC assignments in the canonical question store, including 570 currently included in Self Practice across 139 question sets. These counts are a planning baseline and may change before migration runs.
- SME capacity is not available for item-by-item migration review. Two agreeing independent classifications are accepted as model confirmation; disagreements and invalid cases remain excluded rather than being guessed.
- Classification confidence reported by a model is not sufficient for confirmation without independent agreement and deterministic validation.
- Until confirmed, unresolved questions may continue in fixed Exam or existing non-adaptive Review contexts if those workflows already allow them, but their outcomes do not update BKT.
- Students who already exist at rollout start each KC at 0.30 when first encountered; version 1 does not reconstruct mastery from historical attempts.
- MCQs represent one KC each. SAQs contain two or three scored parts, with exactly one KC per part and potentially one to three distinct KCs per item.
- Existing and future SAQs are selected from the question bank rather than generated on demand during Practice.
- A standard's completion state is based on the active KC catalog, not merely on KCs for which questions happen to exist.
- Practice sessions remain bounded by the existing session or question-count limit. Mastery persists across sessions, so a standard does not need to reach completion in one sitting.
- Review's existing scheduling determines which questions are due; Exam misses influence Review through existing mistake behavior and influence later Practice through BKT, not through a new BKT-driven Review selector.
- Mastery probability is internal learning-state data; version 1 does not require a new student-facing numerical mastery display.
- Parameter fitting, learning curves, per-KC priors, individualized priors, forgetting/decay, response-time evidence, confidence evidence, and information-gain selection are deferred beyond version 1.
- The supplied parameters are treated as estimates for a standard no-forgetting BKT model. If the historical fit enabled a forgetting variant, the parameter set must be revalidated or refit with P(F) fixed at zero before rollout.

## Dependencies

- A complete, governed KC catalog with stable codes and standard membership.
- Reliable final scoring outcomes for MCQs and for each SAQ part.
- Stable attempt identities across retries, offline synchronization, and rescores.
- Existing standard selection, Exam blueprint, Review queue, content visibility, and authorization rules.
- Sufficient confirmed question coverage for each KC intended for adaptive MCQ Practice.
- Sufficient banked SAQ coverage for any KC intended to receive KC-targeted SAQ Practice.

## Out of Scope

- Per-student, per-group, or demographic cold-start priors.
- Re-fitting P(L0), P(T), P(G), or P(S) from live version-1 student data.
- Replaying pre-launch attempt history to initialize existing students.
- Forgetting or time-decay parameters.
- BKT-driven Exam assembly or replacement of the existing Review scheduler.
- KC-targeted SAQ generation during Practice; KC targeting is performed only by selecting already banked SAQs whose part mappings include the target.
- Information-gain selection.
- Teacher-authored overrides of an individual student's mastery probability.
