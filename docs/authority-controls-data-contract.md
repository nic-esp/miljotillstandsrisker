# Myndighetskontroller – datakontrakt

Importen tillför föreslagna myndighetskontroller till den befintliga utforskningsmodellen. Underlaget är version **0.10**, bedömt **30 september 2026**, och hänvisar till riskregisterversion **2.2.0**. Genomförande och effekt är inte verifierade. Ingen införandesannolikhet eller kvantifierad riskreduktion har beräknats.

## Omfattning och scenario

Totalt finns 20 nya kontroller, 173 kopplingsrader och 90 berörda risker. Kontrollistan innehåller 378 poster inklusive de 342 ursprungliga åtgärdsbeskrivningarna och 16 analytiskt sammanförda åtgärderna.

| `scenario` från källan | `priorityScope` | Kontroller | Kopplingar | Unika risker |
|---|---|---:|---:|---:|
| `S1_beslutat_uppdrag` | `main` | 17 | 141 | 78 |
| `Inforande_ej_S1` | `transition` | 1 | 18 | 9 |
| `Framtida_mandat_ej_beslutat` | `future` | 2 | 14 | 6 |

Risker kan ingå i flera scenarier; riskantalen ska därför inte adderas. `metadata.authority.mainScenario` är `S1_beslutat_uppdrag`. Vid val av **Drivs av → Myndigheten** visas huvudscenariot först. Införande och framtida mandat finns i separata urval. Scenarioindelningen återger underlagets bedömning och är ingen sannolikhetsrangordning.

## Poster och nycklar

Importen görs av `authority_controls.mjs` och tillförs genom det valfria tredje argumentet till `createExplorationData(risks, curations, authorityPackage)`.

| Fält | Betydelse |
|---|---|
| Kontrollens `id` | Oförändrat `kontroll_id`, exempelvis `MPM-01`. En kontroll per ID, inte per kopplingsrad. |
| `kind`, `driver` | Båda är `authority` för de 20 förslagen. Befintliga kontroller behåller `driver: "unspecified"`. |
| `implementationStatus` | `proposed_unverified`. |
| `reviewStatus` | `source-analysis-unverified`. Källans egna statusformuleringar finns dessutom kvar. |
| `riskIds`, `chartKeys` | Unika risk- respektive process-ID:n från uttryckliga kopplingar. |
| Målkopplingens `id` | Oförändrat `koppling_id`, exempelvis `MPM-01__R-B10-050-01:trigger:02`. |
| Målkopplingens `sourceItemId` | Oförändrat kanoniskt `malpost_id`, exempelvis `R-B10-050-01:trigger:02`. |
| Målkopplingens `targetId` | Befintligt hashbaserat förekomst-ID i `exploration.occurrences`. |
| Målkopplingens `type`, `role`, `roleBasis` | `cause`/`effect`, avsedd `prevention`/`consequence_reduction`, och alltid `hypothesis`. |

Importen kräver exakta matchningar av risk, process, nod, målpost, ordning, ordalydelse, evidensstatus, källreferenser och ursprunglig motåtgärd. Avvikelser stoppar bygget. Den gissar inte en ersättningskoppling. Två kontroller kan ha samma målpost: 173 relationer avser 172 unika målposter, och båda relationernas ID:n bevaras.

## Källspårning och originalbedömningar

De tre levererade filerna ligger oförändrade i `_build/authority-inputs/`. `manifest.json` anger version, datum, förväntade antal, SHA256 och byteantal. Bygget kontrollerar filernas innehåll mot manifestet.

Kontrollens `sourceRows` innehåller alla dess ursprungliga kopplingsrader med samtliga **46 kolumner**. Varje målkopplings `sourceRecord` innehåller sin fullständiga rad. `sourceTexts` behåller de berörda riskernas ursprungliga motåtgärdstext som jämförelseunderlag; det innebär inte att myndigheten tar över hela förslaget. `provenance` anger källversion, datum, registerversion och filkontrollsummor.

De **342** bedömningarna med **23 kolumner** bevaras i respektive ursprunglig kontrolls `authorityAssessment.sourceRecord`. Därutöver finns bland annat `status`, `acceptedAuthorityPart`, `excludedPart`, `rationale`, `adaptedControlIds`, `independentControlIds` och `possibleUnlinkedControlIds`. Ett möjligt kontrollslag utan koppling skapar ingen målkoppling. Bedömningen av originalförslaget avgör inte om risken kan ha en annan, självständig myndighetskontroll.

Kontrollerna har normaliserade fält för `owner`, `scope`, `legalBasis`, `indicators`, `verificationEvidence`, `baselineDifference`, `triggerFrequency`, `exposure`, `overlap` och `mandateSources`. Målkopplingarna har `applicationConditions`, `relationship`, `effectHypothesis`, `quantifiedEffectSource`, `sourceBasis` och `sourceRefs`. Originalfälten finns kvar även när de inte visas i gränssnittet.

## Senare mätresultat

Varje myndighetskontroll och målkoppling har följande behållare:

```json
{
  "key": "MPM-01__R-B10-050-01:trigger:02",
  "status": "not_measured",
  "context": {
    "controlId": "MPM-01",
    "riskId": "R-B10-050-01",
    "sourceItemId": "R-B10-050-01:trigger:02",
    "scenario": "S1_beslutat_uppdrag",
    "sourceVersion": "0.10"
  },
  "results": []
}
```

På kontrollnivå är `measurement.key` kontrollens ID och `context` innehåller `controlId`, `scenario` och `sourceVersion`. På kopplingsnivå är nyckeln det ursprungliga kopplings-ID:t och kontexten omfattar även risk och målpost. Senare mätimport kan använda nyckeln tillsammans med denna kontext. Resultatformat, metoder och statusövergångar ska fastställas när mätresultaten förs in; inga resultatfält har fyllts med nollor eller uppskattningar nu.

Underlagets indikatorer, jämförelse S0–S1, exponeringsgränser och dubbelräkningsvarningar är bevarade för den kommande mätningen. Antal riskkopplingar mäter dokumenterad omfattning, inte effekt. Kopplingsrader får inte summeras till riskreduktion.

## Export

`exploration.json` innehåller hela modellen. `controls.csv` behåller sina tidigare kolumner och kompletteras med aktör, scenario, mätstatus och JSON-fält för mätning, originalbedömning, källrader, proveniens och myndighetskontext. Ursprungliga CSV-filer är semikolonseparerade med UTF-8 BOM; deras ID:n ska läsas som text.

Datautbudet innehåller **6 JSON-, 5 CSV- och 1 TXT-fil**. De fyra nya källnedladdningarna är `authority-controls-source.csv`, `authority-assessments-source.csv`, `authority-reading-guide.txt` och `authority-source-manifest.json`. De och utforskningsfilerna levereras via GitHub Pages. MCP-serverns befintliga verktyg och riskkontrakt är oförändrade.
