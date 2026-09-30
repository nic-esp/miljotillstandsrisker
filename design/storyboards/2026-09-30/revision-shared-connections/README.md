# Revised storyboards: shared causes, effects and controls

Design exploration, 30 September 2026. No application changes or deployment.

**Latest user clarification:** the product is entirely for read-only investigation and prioritisation. The manual mapping editors, team modes and save/draft actions in these images are superseded. Keep the visual graph and bow-tie ideas; replace the editing frames with inspection of a control's existing targets, comparison of documented reach and investigation of shared causes/effects. The updated [plan](../../../../PLAN-controls-bowties-graph.md) is authoritative for this behavior. Images are retained as historical design artifacts.

This set supersedes the sparse, selected-neighborhood graph proposed in the first storyboards. All 342 risk nodes must remain present in the default overview and when highlighting a shared cause, effect or control. Controls may connect to several specific causes, risk events or consequences, including targets across risks.

Options follow the order these new results appeared in chat:

1. [Gemensamma orsaker och effekter](01-gemensamma-orsaker-och-effekter.png)
2. [Ett nätverk av gemensamma samband](02-natverk-av-gemensamma-samband.png)
3. [Från gemensam orsak till gemensam konsekvens](03-fran-orsak-till-konsekvens.png)

Each image contains three numbered journey frames. Those internal numbers do not identify the options.

## Binding behavior

- A control is one reusable record; its prepared links target individual cause occurrences, events or consequence occurrences within and across risks. Visitors inspect these links.
- Shared cause/effect concepts retain original wording and evidence for each risk. Proposed similarity remains separate from reviewed equivalence.
- Selecting a control highlights its exact targets and the distinct risks those links reach. Other risks remain visible. Coverage counts are distinct risks, not edges or demonstrated risk reduction.
- Shared-concept membership does not automatically extend a control's scope. Explicit target occurrences are validated during upstream data preparation.
- All site users browse and investigate. Search, sort, highlight and comparison affect view state only; there is no manual mapping or editing workflow in this feature.
- The risk list, controls register and existing process maps remain part of the wider plan.

## Generated-image review notes

These are visual mockups. Their dot counts, incidental process names, small text and connectors are illustrative, not a validated graph export. Production must render exactly the canonical risk records and approved relationships. No option is implementation-ready data.

The first image sometimes routes cause arrows through a control; implementation must instead keep cause → event → consequence edges intact and use separate control → target connectors, as specified in the plan. The second and third clarify this arrangement. Some overview curves visually pass other risk points; they must not become risk-to-risk causal links. Original occurrence wording and source/analysis labels must be used in the inspector, rather than generated paraphrases. Proposed example control IDs and actions remain subject to review.

## Sources and scope

Canonical source: `Artefakt_C_Riskregister/Artefakt_C_riskregister.json`.

Source-grounded examples in the revised [plan](../../../../PLAN-controls-bowties-graph.md):
- repeated cause across R-B40-060-01/02/03;
- repeated missed-water-work-window consequence across R-B40-GE120-02, R-B40-N120-02 and R-B40-N140-02;
- similar project-version causes across R-B20-090-01, R-B50-P040-02 and R-B60-030-01.

The source has risk-specific text, not approved shared concept entities or measured control effectiveness. New shared records and links are proposals.

Generated with the built-in Image Gen tool. Exact [prompts](PROMPTS.md) and all three original outputs are preserved. No direction is selected yet.
