# Artefakt C – Riskregister (miljötillståndsprocessen)

**Version:** 1.1
**Baslinje:** S0 (gällande rätt per 2026-08-14, inkl. SFS 2026:400 och lag 2026:399)
**Bygger på:** Artefakt B – Processkarta + nodordbok (v0.8)

## Leveransens funktion

Artefakten samlar **342 risker** på nodnivå för samtliga **160 riskmappbara detaljnoder** (B10–B70) i processkartan för miljötillstånd. Varje risk beskriver vad som kan hindra, fördröja, störa eller fördyra nodens del av processen. B00 (masterprocess), handoffs och rena navigationsnoder är av design inte riskmappade, i enlighet med Artefakt B:s `risk_mapping_allowed`.

Registret innehåller **medvetet inga sannolikhets- eller konsekvensbedömningar** — endast fullständiga kausala beskrivningar. Kvantifiering för Sverige-årsmätningen (BTL) sker i separata artefakter och kan kopplas till riskerna via `risk_id`/`node_id`.

## Filerna

- **Artefakt_C_riskregister.json** – kanonisk, maskinläsbar datafil (342 riskobjekt).
- **Artefakt_C_riskregister.html** – fristående webbapp (single-file, ingen internetåtkomst eller installation krävs). Öppnas direkt i valfri webbläsare. Funktioner:
  - fulltextsökning med markering (titel, beskrivning, motivation, påverkan, motåtgärder m.m.),
  - kombinerbara filter på **riskens ursprung** (Myndighet & prövning / Sökande & ansökan / Extern & omvärld), nod, delprocess och riskkategori, med räknare,
  - fyra vyer: riskkort (expanderbara), **processkarta** (interaktiv visualisering av samtliga åtta diagram B00–B70 med noder tonkodade efter antal mappade risker, zoom/panorering, klick på nod visar fakta och nodens risker, samt handoff-länkar mellan diagram), nodbläddrare (nodfakta + nodens risker) och statistik (inkl. fördelning per ursprung),
  - sortering (diagram/nod, kategori, ursprung, nodnamn, flest berörda noder),
  - **CSV-export i varje vy**: filtrerat riskurval (riskvyn), alla noder (nodbläddraren), aktuellt diagrams noder och kanter (processkartan) samt statistiksammanställning (statistikvyn). Semikolonseparerat med UTF-8-BOM för Excel,
  - klickbara källhänvisningar till kallregistrets myndighetskällor samt externa domar/dokument.
- **_build/** – byggskript och fragment (se nedan).

## Riskschema (fält per riskobjekt)

| Fält | Innehåll |
|---|---|
| `risk_id` | `R-<node_id>-NN`, globalt unikt |
| `node_id`, `chart_key`, `node_label` | Koppling till Artefakt B:s nodordbok |
| `title` | Kort rubrik |
| `category` | En av elva fasta kategorier (Rättslig osäkerhet, Myndighetskapacitet & handläggning, Underlagsbrist & data, Samråd & motstånd, Överklagande & rättsprocess, Intressekonflikt & markåtkomst, Teknisk komplexitet, Politisk & policyrisk, Sektorssamordning, Extern händelse, Klimat & naturhändelse) |
| `origin` | Riskens ursprung — vems handlande/underlåtenhet som i första hand orsakar risken: **Myndighet & prövning** (prövande myndigheter, domstolar, systemdesign; 118 risker), **Sökande & ansökan** (projektägarens underlag, val och agerande; 145 risker) eller **Extern & omvärld** (tredje part, överklaganden från motståndare, politik, lagreformer, klimat; 79 risker). Klassificeringen vägleder var processförbättringar kan göra skillnad |
| `trigger` | Vad som kausalt utlöser risken |
| `description` | Fullständig beskrivning av riskens mekanism i noden |
| `motivation` | Varför risken är reell — namngivet svenskt prejudikat/praxis (verifierat via webben) eller strikt välgrundat rättsligt resonemang kopplat till nodens rättsliga grund |
| `affects` | Noden själv samt berörda upp-/nedströms noder (med node_id) |
| `impact` | Kvalitativ effekt om risken realiseras (fördröjning, merkostnad, avbrott, omprövning, förlorad byggberedskap) |
| `mitigation` | Konkreta förebyggande och hanterande motåtgärder |
| `source_refs` | Koder ur Artefakt B:s kallregister samt `EXT:`-referenser med URL |
| `scenario_tags` | Ärvda från noden (S0/S1-relevans) |

## Täckning och validering

Maskinell kontroll (`_build/build_riskregister.mjs`): **160/160 noder täckta**, unika risk_id:n, samtliga risker pekar på noder med `risk_mapping_allowed=true`, obligatoriska fält ifyllda, kategori- och ursprungsvokabulär samt källreferenser validerade mot kallregistret. Resultat: **godkänd, 0 fel, 0 varningar**.

| Diagram | Noder | Risker |
|---|---:|---:|
| B10 Förstudie och prövningsväg | 10 | 23 |
| B20 Samråd och miljöbedömning | 13 | 26 |
| B30 Miljöfarlig verksamhet | 21 | 44 |
| B40 Vattenverksamhet | 30 | 72 |
| B50 Tvärgående och sektorsspår | 39 | 82 |
| B60 Ansökan, beslut och överprövning | 30 | 58 |
| B70 Laga kraft och byggberedskap | 17 | 37 |
| **Totalt** | **160** | **342** |

## Metod

Riskerna formulerades per delprocess med utgångspunkt i nodernas beskrivning, aktör, rättsliga grund och flödesberoenden. Historiska prejudikat i `motivation`-fälten verifierades via webbsökning innan de användes (bl.a. Kallak/Gállok HFD 2024 not. 36, Nordkalk/Ojnarefjärden MÖD 2016:1 och M 5375-14, Markbygden, Preemraff, Blekinge offshore, Norra Kärr HFD 2016 ref. 21, Norrbotniabanan, Cementa/Slite samt handläggningstidsstatistik). Exempel som inte kunde verifieras användes inte; berörda risker motiverades i stället med uttryckliga rättsliga resonemang. Inga målnamn eller diarienummer har fabricerats.

## Återbyggning

```bash
node _build/extract_nodes.mjs          # nodurval ur Artefakt B:s nodordbok
node _build/build_riskregister.mjs     # slå ihop fragment + validera → JSON
node _build/build_html.mjs             # generera webbappen
```

## Avgränsningar

Samma avgränsningar som Artefakt B: registret slutar vid praktisk tillståndsmässig byggberedskap. Drift, löpande tillsyn, upphandling, finansiering och kommersiella investeringsbeslut ligger utanför. S1-risker (Miljöprövningsmyndigheten) är fångade där nodernas `s1_delta` markerar förändring; S2 är inte inbyggt.
