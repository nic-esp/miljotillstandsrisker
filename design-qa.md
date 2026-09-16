# Miljötillståndsrisker: design and interaction QA

Date: 16 September 2026.

Source visual truth: https://www.svensktnaringsliv.se/ (live homepage and its rendered CSS inspected in the browser).

Implementation: the self-contained `Artefakt_C_Riskregister/Artefakt_C_riskregister.html`, published with the supporting `site/` pages by `.github/workflows/deploy-pages.yml`. The application was reviewed at http://127.0.0.1:4173/miljotillstandsrisker/ before migration to this original standalone repository.

Screenshot evidence: source and implementation screenshots were captured together in the same computer-use result in this task, followed by a mobile screenshot. The browser tool emitted the images into the task transcript; no filesystem screenshot path was provided. Additional captures show the score distribution, risk cards, and highlighted process nodes.

Desktop viewport: 1280 × 720 CSS pixels, device pixel ratio 1; content width 1265 pixels after the scrollbar. Both source and implementation used the same viewport and density, without rescaling. Mobile viewport: 390 × 844 CSS pixels, content width 375 pixels, device pixel ratio 1. Temporary viewport overrides were reset after testing.

State: source homepage; implementation ranking overview, master register, B00 overview, and B10–B70 process views. This is a CSS style adaptation to an existing data application, not a reproduction of the source homepage's content or layout.

## Findings

No actionable P0/P1/P2 visual findings remain in the tested views.

- Typography: bold grotesque headings, compact navigation, readable body and small metadata follow the source hierarchy. The implementation uses Arial/Helvetica fallbacks rather than copying the source's licensed Lab Grotesque files. This is an accepted implementation constraint; a licensed font can be supplied later for closer typographic matching.
- Layout: flat, square white panels, restrained borders, charcoal navigation and clear spacing carry the reference style into the denser register. Desktop overview uses two columns for process and node summaries; mobile stacks these and wraps navigation. No horizontal document overflow at the tested mobile width.
- Colors: the stylesheet uses the inspected orange `#ea8f12`, charcoal `#1f272f`, body `#33414e`, warm white `#faf9f7`, muted gray `#eff2f5`, and beige `#f9e2c2`. Orange identifies the top 50; pale beige distinguishes explicit downstream effects.
- Assets: the official stacked desktop and horizontal mobile Svenskt Näringsliv logos are embedded from the exact original homepage SVGs. Original paths, colors, proportions and white wordmarks are preserved. Source URLs, selectors and SHA-256 hashes are recorded in `site/assets/svenskt-naringsliv-logo-source.json`. The existing process charts remain vector based. No reference asset was replaced with a hand-drawn approximation.
- Copy: Swedish labels distinguish 342 register entries, 341 ranked risks, the top 50, and 40 directly mapped nodes. The run date is shown. Relative BTL scores are not presented as event probabilities or added into node probabilities. The absent source risk remains visible as unranked.

Focused comparisons used the header, navigation, panel headings, buttons, rank badges, and score chart. These were readable at the captured scale; a separate crop was unnecessary. The reference's event cards and editorial text are intentionally not copied into the risk application.

## Iteration and evidence

- The B00 subprocess detail initially reported no directly attached top-50 risk while its overview node was orange. The summary now reports the child process's count and best direct rank. Browser verification of B00-SP50 showed 15 top-50 risks and best rank 2, with a working jump to B50. A regression covers all seven subprocess nodes.
- The initial score chart imposed a 2% visual floor. This was removed so every bar is proportional to its exported source score, including the lower tail. The revised chart was captured beside the reference.
- Final desktop and mobile captures show consistent colors, spacing, wrapping, and accessible navigation. No additional visual changes were needed after the final comparison.
- Following the user's logo and naming request, the header was revised to use the original stacked logo at 154 pixels on desktop and original horizontal logo at 239 pixels on mobile, with the exact H1 “Miljötillståndsrisker”. The revised desktop capture was compared in the same input as the official homepage, followed by a 390 × 844 mobile capture. The full title fits, both official logos render correctly, and the document has no horizontal overflow. The unrelated partnership-overview link was removed from this microsite's public navigation.
- After restoring the original standalone repository, the AI-access and raw-data pages were reviewed from a local artifact assembled with the Pages workflow's file layout. The raw-data page was also checked at 390 × 844 pixels: all six dataset links remain visible, navigation wraps correctly, and document width is 375 pixels with no horizontal overflow. All eight existing destination links and their descriptions were preserved.

## Interaction checks

- Top-50 action clears stale search/filter state and returns exactly 50 cards.
- Clearing filters restores all 342 entries: 341 ranked and one unranked.
- The “Alla risker” navigation button also resets filters and restores all 342 entries in one action.
- Source order, scores, cutoff, and CSV output are checked against the imported snapshot.
- Overview shows 341 bars, 50 highlighted; table switches between 50 and 341 rows.
- Keyboard activation expands risk cards; risk links open the correct process node.
- All seven process tabs were exercised in the browser. Direct node counts are B10: 1, B20: 3, B30: 11, B40: 4, B50: 12, B60: 6, B70: 3, totaling 40.
- Downstream mode adds only explicitly mentioned affected nodes. B70 retains its three direct highlights and adds six downstream-only highlights.
- B00 subprocess jump and overview/readable zoom controls work.
- Mobile risk and process views were inspected, including focused node highlighting.
- No browser console errors were reported during these interactions.
- The final prepared risk page opens without a password input. The standalone Pages workflow publishes the generated HTML directly without adding encryption.
- Standalone `npm run verify` rebuilt the generated artifacts and completed 119 tests: 118 passed, one optional deployed-server check skipped, zero failures. Reimporting the source exports reproduced the ranking snapshot byte for byte.

## Implementation checklist

- [x] Import and validate the specific completed BTL run.
- [x] Preserve all register risks and source ranking semantics.
- [x] Add relative comparison, filters, badges, exports and process highlighting.
- [x] Apply reference styling and verify desktop/mobile behavior.
- [x] Prepare password-free permit-risk publication.
- [ ] Publish and verify the live GitHub Pages URL.

Live deployment is a delivery task, not an unresolved visual defect. Live deployment has not been claimed.

final result: passed
