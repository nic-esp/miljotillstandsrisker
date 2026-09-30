# Miljötillståndsrisker: controls, bow ties and connected views

Planning proposal, 30 September 2026. No application changes or deployment are included in this step.

Confirmed product purpose: visitors investigate the published data from different angles to understand which risks deserve attention and which motåtgärder have the broadest documented reach, especially across highly ranked risks. All site interactions are read-only: search, sort, filter, compare, select, highlight and follow connections. Manual linking, authoring forms, team modes, draft/review screens and an editing backend are outside this change. Data preparation and validation happen upstream of the published dataset. Preserve the existing Svenskt Näringsliv design, all risks, top-50 filtering, ranking provenance and process diagrams.

Confirmed design revision, 30 September: a control can target one or several causes, risk events or consequences, including targets across several risks. The knowledge graph must show all 342 risks simultaneously and expose shared causes, shared consequences and the scope of reusable controls. This replaces the earlier proposal to start with collapsed processes and reveal risks on demand. The user approved implementation on 30 September. The cause–risk–consequence visual direction is the build baseline.

Latest clarification: the positioning and links in the bow tie explain the prepared data; visitors do not create or change them. The editing panels in the generated storyboards are superseded. Replace those frames with exploration of a control's reach, comparison of controls and inspection of shared causes/effects. The existing visual directions remain usable; an editing workflow is not needed to make the design concrete.

## 1. Starting point

The local canonical risk register contains 342 risks and 342 populated, unique mitigation paragraphs. These paragraphs sometimes combine several actions. They are not yet individual, reusable control records. There are no recorded implementation states or measured control-effectiveness values.

There are already 1,275 structured causes and 1,257 structured consequences, with source/analysis labels. Risks have explicit primary mappings to 160 nodes across seven subprocesses. The full process export also includes B00, navigation and handoff nodes.

The current `envpermit` checkout is at `e1f78b8`, before the published top-50 and branding changes. The live risk page was inspected on 30 September and still contains those changes. Reconcile this checkout with the current published branch before implementing; do not replace the published version with this older template.

## 2. Shared records and relationships

Use one set of records across tables, detail views, bow ties and the knowledge graph.

| Record | Purpose |
|---|---|
| Risk | Existing stable risk ID, description, ranking and evidence |
| Control / Motåtgärd | Stable independent ID, short action title, complete description, provenance and editorial review state |
| Cause / consequence occurrence | Stable ID for the original wording in one risk, with source/analysis status and evidence |
| Shared cause / consequence concept | Reviewed common meaning linked to occurrences from multiple risks; preserves their original wording and scope |
| Control–target mapping | Connects one control to a specific cause occurrence, risk event or consequence occurrence; records role, rationale, scope and review state |
| Process node | Existing stable node ID and membership of a process |
| Control–node mapping | Optional explicit statement of where a control is performed; separate from nodes reached through its linked risks |

One risk may have several controls; one control may address several targets in the same risk and targets in several risks. Store explicit typed target links and derive risk–control membership and both directions from them, so removing a link updates every view consistently. A broad legacy risk-level link remains visibly unclassified until its target is reviewed. Control IDs must survive renaming, splitting and reviewed merges.

Keep a shared concept separate from its risk-specific occurrences. Exact repeated text and semantic similarity are different kinds of candidate matches; neither silently merges records. The team reviews meaning and scope before publication. A control attached through a shared concept must list the covered occurrences explicitly; adding another occurrence to that concept must not silently add control coverage. Shared concepts describe recurring conditions or outcomes, not proof that the risks are statistically dependent or co-occur.

The role belongs to the relationship: a shared control may prevent one event but limit the consequences of another. Support prevention, detection/monitoring, consequence reduction, combined and unclassified roles. Add stable IDs to individual causes and consequences before linking controls to those branches; positional array indexes are not durable identifiers.

Distinguish “linked control” from “implemented control” and from “proven effective control.” Do not infer residual probabilities, percentage reductions or node-disruption probabilities from a link count or BTL score. Actual project implementation status would need a separate project-specific record in a later phase.

## 3. Controls register and investigation

Add a top-level **Motåtgärder** view with compact columns for ID/title, role(s), linked top-50 risks, all linked risks and linked processes. Allow search, sorting and filters by process, risk, role and evidence status. Counts always refer to distinct records in the current scope; show the active scope clearly.

A control detail page shows the full action, original source text, evidence, linked risks and process connections. Distinguish “via linked risks” from explicit “performed at” node mappings. Links lead back to risk details and process maps.

Selecting a control highlights the exact causes, risk events and consequences it addresses and all linked risks across processes. The inspector groups existing targets by risk, then Orsaker / Riskhändelse / Konsekvenser, with original wording, evidence and a link to the corresponding bow tie. Visitors can inspect a target, follow its related risks or return to the register without losing their place. There are no target-editing checkboxes, connect/disconnect actions or save buttons.

Allow visitors to compare a small selection of controls side by side: linked top-50 risks, distinct risks, shared versus additional risks, process reach, target type and evidence. Comparison selection is temporary view state, never a change to the data. Show which risks are shared between the selected controls and which are reached by only one; deduplicate the union rather than summing individual counts. Use terms such as **Kopplade risker** and **Ytterligare kopplade risker**, not claims of mitigated risks.

Keep the existing static publication path. Prepare stable records, shared concepts and explicit control-target links before publishing; retain their provenance and validation status in the dataset. No new authentication, editorial service or write API is required for this feature. Keep published data versioned and preserve existing exports.

### Transparent views of importance

Offer named perspectives that visitors can understand and switch between, rather than an unexplained combined importance score:

- **Högst BTL-rang:** the existing relative likelihood ordering of risks, with snapshot provenance and the unranked risk handled explicitly. It is not an impact ranking or an absolute probability.
- **Motåtgärder kopplade till flest topp-50-risker:** default control ordering by distinct linked top-50 risks, then distinct linked risks overall. Show both counts and the linked items. This is a documented reach measure, not an estimate of effectiveness or best investment.
- **Bredast kopplingar:** distinct risks and processes reached by a control, and recurring causes/consequences shared by risks. Count each risk once even when several of its branches are connected. A proposed similarity alone contributes no confirmed coverage.
- **Topp-50-risker utan dokumenterad motåtgärd:** a documentation-gap view. Absence of a published link does not prove the real-world risk is unmanaged.

Do not sum BTL ranks, convert graph degree into likelihood, or infer expected risk reduction. Cost, feasibility, severity and measured effectiveness are not recorded well enough to establish an overall optimal control ranking. Keep this limitation close to the relevant comparison rather than adding a generic warning to every screen.

## 4. Compact risk list

Make a table the default desktop view. Proposed columns:

**BTL-rang | Risk-ID och titel | Motåtgärder | Processer | Processnoder | Kategori**

Use restrained row separators, a sticky header, an orange top-50 marker and one or two lines for the risk title. Related-item cells show short clickable labels and a `+N` overflow button. Keep direct mappings distinct from explicitly recorded downstream effects.

Retain the top-50 filter and add controls/process filters and **Utan dokumenterad motåtgärd**. Evidence status remains inspectable when needed. These describe documented relationships, not whether the risk has been mitigated.

Clicking a risk opens a detail panel without losing filters, sort order or scroll position. Offer a full-page permalink for the larger bow tie. On mobile, prioritize rank, title and relationship counts, with remaining fields in the detail view.

## 5. Bow-tie risk detail

Use a structured, left-to-right causal diagram:

**Orsaker → Riskhändelse → Konsekvenser**, with motåtgärder placed beside the specific targets they address.

The event is central; cause and consequence branches fan out on either side. Keep original causal arrows intact. Draw each control as a separate object with a distinct connector to each targeted cause, event or consequence. A single control targeting several branches is shown once with several connectors, rather than duplicated as independent controls. Positioning is determined by its targets; do not force every control into a left/right barrier column or insert a control as a cause in the causal chain.

Keep short labels on the diagram and reveal full wording, source/analysis status, evidence and links on selection. Selecting a control highlights its precise targets and offers **Visa alla kopplade risker**. Selecting a cause or consequence shows its connected controls and where the same or a similar condition appears in other risks, with the relationship status clearly identified. Visitors can move from a single risk to the full graph and back with selection and table state preserved. Provide a keyboard-accessible target list. All positions and mappings are supplied by the prepared dataset; no editing gestures or authoring controls are present.

Unclassified controls stay in a clearly labelled connected-controls section beneath the diagram until their placement is reviewed. Monitoring actions must be labelled as such: monitoring an appeal deadline does not establish that the action prevents the appeal.

Use the existing charcoal, warm white and orange palette, with shape, labels and line styles distinguishing entity types and relationship meanings. Keep orange reserved for the existing ranking emphasis where practical. Include fit-to-view, zoom, a mobile stacked layout and an accessible text/list equivalent.

## 6. Interactive knowledge graph

Add **Sambandskarta** to navigation. Start with the entire register: all 342 individual risk nodes are visible simultaneously, with shared cause and consequence concepts connecting to multiple risks and reusable controls connected to their explicit targets. Use the full width of the screen. Process membership is secondary grouping or coloring; seven process bubbles must not replace the risk nodes. Keep existing process diagrams as the view for chronological flow.

Interaction:

- Search for a risk, cause, consequence, control or process and highlight the matching records without removing the other risks.
- Select a shared cause or effect to see its fan-out or fan-in across all connected risks, with risk-specific source wording in the inspector.
- Select a control to highlight its exact targets and the distinct risks reached by those links across processes. Keep the remaining risk nodes visible at lower contrast.
- Select two or more controls for a read-only comparison; distinguish shared risk connections from the additional connections of each control while retaining all risk nodes. Provide the same deduplicated counts as the controls register.
- Distinguish direct control targets from paths reached through a shared concept; show the exact scope and avoid suggesting a control addresses every risk near that concept.
- Highlight top 50 or a selected process while retaining all risk nodes. Explicit optional filters may narrow a separate view, with a visible count and **Visa alla 342 risker** reset; the default overview and selection flow stay complete.
- Open the matching risk, control or process detail without losing the graph context.
- Preserve shareable selection/filter state in the URL.
- Offer an accessible relationship list and respect reduced-motion settings.

Use different shapes and a clear legend for risks, causes, consequences and controls. Distinguish causal direction, control-target links, reviewed shared membership and proposed semantic similarity. Original source/analysis labels remain available. Process nodes and downstream relationships are optional layers so they do not obscure the shared-cause/effect view. Shared-node size may encode a clearly labelled distinct-risk count; deduplicate risks reached through multiple targets. Neither size nor line width implies likelihood or control effectiveness.

A fully expanded occurrence graph exceeds 3,600 items. Preserve all risk nodes while controlling label density, edge opacity, edge bundling and zoom detail. Reviewed shared concepts reduce repeated visual nodes without losing original occurrences, which remain inspectable. Pending similarity suggestions are a separate explicit layer. No candidate clustering may erase risks, hide unmatched source occurrences from navigation or imply reviewed equivalence. Keep positions stable on selection; avoid perpetual animation. Prototype the renderer against the actual full dataset and validate speed, label readability, selection and keyboard/list access before choosing a library. Cytoscape.js remains an implementation candidate, subject to this full-register performance check: https://js.cytoscape.org/

Source-grounded storyboard examples (proposed shared records, not already approved mappings):

- **Repeated cause:** R-B40-060-01, R-B40-060-02 and R-B40-060-03 all include “Parallella prövningar använder olika ritningsversioner eller miljöförutsättningar.” All three occurrences are analysis-labelled.
- **Repeated consequence:** R-B40-GE120-02, R-B40-N120-02 and R-B40-N140-02 all include “Projektet kan förlora det planerade arbetsfönstret för vattenarbetena.” All three occurrences are analysis-labelled.
- **Similar cause across processes:** R-B20-090-01, R-B50-P040-02 and R-B60-030-01 describe different project versions in application documents. A proposed common concept “Olika projektversioner i underlagen” and reusable control “Gemensam granskning av projektunderlag” need scope review; retain the different source status and PBL-specific context.

## 7. Migration and delivery sequence

1. Reconcile with the published application; preserve current risk IDs, ranking snapshot and mappings.
2. Import the 342 original mitigation paragraphs losslessly as reviewable control packages linked to their source risks. Preserve original text and provenance. Review splitting into individual actions and merging equivalent controls; do not merge by wording similarity alone. Prioritize the top 50 for detailed branch mapping while preserving coverage of all risks.
3. Prepare stable cause/consequence occurrence IDs, candidate shared concepts, split controls and exact target scopes upstream. Validate and publish the versioned read-only dataset using the existing publication path.
4. Deliver the controls register, compact risk table, transparent sort perspectives, reciprocal detail links and read-only control comparison.
5. Deliver the bow tie using reviewed branch mappings.
6. Deliver the full-register graph from those same records and relationships, after validating its performance with all 342 risks visible.

The implemented views use the coordinated storyboards as visual references for investigation. The set in `design/storyboards/2026-09-30/revision-shared-connections/` supplies the all-risk graph and precise multi-target layout; its authoring frames are superseded by the latest clarification. Replace them with **Vilka risker berörs?**, **Vilka motåtgärder når flest topp-50-risker?** and **Var överlappar åtgärdernas kopplingar?** Generated text and topology are illustrative; canonical records and validated links determine implementation.

## 8. Acceptance checks

- All 342 source mitigation texts remain traceable; reimport does not duplicate controls or lose reviewed links.
- One shared control can link to multiple causes, events and consequences within and across risks. A published dataset update is reflected consistently in lists, distinct-risk counts, details, bow ties, exports and graph.
- All 342 risk nodes are present in the default graph and remain visible when selecting a cause, consequence or control. Labels can adapt to zoom; risk nodes cannot be replaced by collapsed process groups.
- A reviewed shared cause or effect connects to several risks while retaining each occurrence's original wording and evidence. Suggested similarity is visibly separate from reviewed equivalence.
- Adding a risk occurrence to a shared concept never silently expands a control's scope. Distinct-risk coverage counts cannot be inflated by multiple links to the same risk.
- Invalid IDs, duplicate links and mismatched risk/occurrence ownership are rejected. A control may explicitly target occurrences owned by several different risks.
- Every site action is read-only. No team mode, manual link editor, draft/publish workflow, mutation endpoint or new authentication dependency is introduced.
- Clicking a control identifies its exact targets and linked risks; clicking a shared cause/effect identifies the relevant risks and controls while preserving the full-register context.
- Control comparison distinguishes overlap from additional documented reach. Counts deduplicate risk IDs and proposed similarity does not inflate confirmed coverage.
- Risk and control sort labels state their actual quantity. BTL rank, connected-risk counts, impact, control effectiveness and implementation status are not conflated.
- Every graph connection is explainable from a stored or explicitly labelled derived relationship.
- Unreviewed controls are not presented as proven preventive barriers or implemented safeguards.
- All risks, the unranked risk, top-50 behavior, source evidence and process navigation remain intact.
- Table, diagram and graph are usable with keyboard and mobile layouts; graph exploration has a text alternative.
- JSON/CSV and the existing read-only MCP surface are updated deliberately, with documented compatibility.

Local sources: `Artefakt_C_Riskregister/Artefakt_C_riskregister.json`, `_build/risk_fields.mjs`, `_build/app_template.html`, `Artefakt_B_Processkarta_nodordbok/Artefakt_B_processkarta_import.json`. Live reference inspected: https://nic-esp.github.io/miljotillstandsrisker/?risk=R-B70-G090-02


## Implementation status — 30 September 2026

Implemented as a self-contained static app: compact risk table, controls register, two- or three-control comparison, source-preserving multi-target bow ties, shared-concept detail, and a fixed-position graph containing all 342 risk nodes. No editing or authentication workflow was added. The renderer is native SVG and HTML; no new front-end runtime dependency is required.

All 342 original mitigation descriptions are imported. The initial analytical grouping is deliberately partial: 16 shared controls cover 56 risks through 118 explicit targets; 51 exact-text groups and 12 semantic groups expose recurring causes and consequences. Grouping is labelled as analytical, not independently reviewed. Counts describe links, never measured effectiveness. Precise branch placement is only shown for explicit targets; original source controls retain a broad risk-event link marked as unspecified.

Graph control selection follows explicit risk links, with exact cause/event/effect scope in the inspector and bow tie. Comparing controls opens the dedicated comparison view. All risk nodes remain present and fixed during highlights. Details can be shared via URLs. See design-qa.md for browser and test evidence.
