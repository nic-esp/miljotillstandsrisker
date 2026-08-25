# Artefakt C – Riskregister (miljötillståndsprocessen)

**Version:** 1.3
**Baslinje:** S0 (gällande rätt per 2026-08-20, inkl. SFS 2026:400 och lag 2026:399)
**Orsaks- och konsekvensresearch:** 2026-08-24
**Bygger på:** Artefakt B – Processkarta + nodordbok (v0.9)

## Leveransens funktion

Artefakten samlar **342 risker** på nodnivå för samtliga **160 riskmappbara detaljnoder** (B10–B70) i processkartan för miljötillstånd. Varje risk beskriver vad som kan hindra, fördröja, störa eller fördyra nodens del av processen. B00 (masterprocess), handoffs och rena navigationsnoder är av design inte riskmappade, i enlighet med Artefakt B:s `riskMappingAllowed`.

Registret innehåller **medvetet inga sannolikhets- eller kvantitativa allvarlighetsbedömningar**. Varje riskhändelse har i stället flera möjliga utlösande faktorer och flera kvalitativt beskrivna konsekvenser. Kvantifiering för Sverige-årsmätningen (BTL) sker i separata artefakter och kan kopplas till riskerna via `risk_id`/`node_id`.

## Filerna

- **Artefakt_C_riskregister.json** – kanonisk, maskinläsbar datafil (342 riskobjekt).
- **LEGAL_REVIEW.md** – omfattning, kvalitetsregler och förvaltningsnotering för sak- och rättskällegranskningen 2026-08-20.
- **Artefakt_C_riskregister.html** – fristående webbapp (single-file, ingen internetåtkomst eller installation krävs för att läsa och söka den inbyggda datan). Källänkarna kräver internetåtkomst. Öppnas direkt i valfri webbläsare. Funktioner:
  - fulltextsökning med markering (titel, beskrivning, motivation, påverkan, motåtgärder m.m.),
  - kombinerbara filter på **riskens ursprung** (Myndighet & prövning / Sökande & ansökan / Extern & omvärld), nod, delprocess och riskkategori, med räknare,
  - fyra vyer: riskkort (expanderbara), **processkarta** (interaktiv visualisering av samtliga åtta diagram B00–B70 med noder tonkodade efter antal mappade risker, zoom/panorering, klick på nod visar fakta och nodens risker, samt handoff-länkar mellan diagram), nodbläddrare (nodfakta + nodens risker) och statistik (inkl. fördelning per ursprung),
  - sortering (diagram/nod, kategori, ursprung, nodnamn, flest berörda noder),
  - **CSV-export i varje vy**: filtrerat riskurval (riskvyn), alla noder (nodbläddraren), aktuellt diagrams noder och kanter (processkartan) samt statistiksammanställning (statistikvyn). Riskexporten är semikolonseparerad med UTF-8-BOM för Excel; hela bow-tie-strukturen finns som förlustfri JSON i en enda cell per risk,
  - klickbara källhänvisningar till kallregistrets myndighetskällor samt externa domar/dokument.
- **_build/** – underhållna synk-, extraktions- och webbbyggskript samt genererat nodutdrag. `Artefakt_C_riskregister.json` är den kanoniska riskkällan; lokala äldre `risks_*.json`/`origin_*.json`-fragment och det ignorerade legacy-skriptet `build_riskregister.mjs` ingår inte i byggkedjan och får inte användas för att skriva över den granskade filen.

## Riskschema (fält per riskobjekt)

| Fält | Innehåll |
|---|---|
| `risk_id` | `R-<node_id>-NN`, globalt unikt |
| `node_id`, `chart_key`, `node_label` | Koppling till Artefakt B:s nodordbok |
| `title` | Kort rubrik |
| `category` | En av elva fasta kategorier (Rättslig osäkerhet, Myndighetskapacitet & handläggning, Underlagsbrist & data, Samråd & motstånd, Överklagande & rättsprocess, Intressekonflikt & markåtkomst, Teknisk komplexitet, Politisk & policyrisk, Sektorssamordning, Extern händelse, Klimat & naturhändelse) |
| `origin` | Riskens ursprung — vems handlande/underlåtenhet som i första hand orsakar risken: **Myndighet & prövning** (prövande myndigheter, domstolar, systemdesign; 118 risker), **Sökande & ansökan** (projektägarens underlag, val och agerande; 145 risker) eller **Extern & omvärld** (tredje part, överklaganden från motståndare, politik, lagreformer, klimat; 79 risker). Klassificeringen vägleder var processförbättringar kan göra skillnad |
| `trigger` | Bakåtkompatibel sammanfattning av den huvudsakliga utlösande faktorn |
| `trigger_factors` | 3–5 atomära möjliga utlösande faktorer. Varje objekt har `text`, `basis` (`source` eller `analysis`) och en lista `source_refs` |
| `description` | Fullständig beskrivning av riskens mekanism i noden |
| `motivation` | Varför risken är reell — primärkällestött exempel, rättsligt resonemang eller uttryckligen kvalificerad bedömning kopplad till nodens rättsliga grund |
| `affects` | Noden själv samt berörda upp-/nedströms noder (med node_id) |
| `impact` | Bakåtkompatibel sammanfattning av den huvudsakliga konsekvensen |
| `consequences` | 3–5 atomära möjliga konsekvenser med samma evidensmodell som `trigger_factors` |
| `mitigation` | Konkreta förebyggande och hanterande motåtgärder |
| `source_refs` | Koder ur Artefakt B:s kallregister samt `EXT:`-referenser med URL |
| `scenario_tags` | Ärvda från noden (S0/S1-relevans) |

## Täckning och validering

Maskinella kontroller i `mcp-server/test/` verifierar schema, identifierare, nodmappning, täckning, källkodsupplösning, externa URL-format och särskilda regressioner för rättsfall och processregler. Dessa kontroller bevisar intern konsistens men ersätter inte juridisk bedömning. Den sakliga genomgången den 20 augusti 2026 rättade felaktiga målanknytningar, instanskedjor och lagrum samt införde kontrollpunkter mot att de återkommer.

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

Riskerna formulerades per delprocess med utgångspunkt i nodernas beskrivning, aktör, rättsliga grund och flödesberoenden. Den kompletterande researchen använder riskhändelsen i `title`/`description` som centrum och skiljer på flera möjliga orsaker före händelsen och flera möjliga följder efter händelsen. `basis: source` betyder att postens rättsliga, processuella eller faktiska premiss är förankrad i angivna referenser; det betyder inte automatiskt att referensen empiriskt bevisar hela kausalkedjan. `basis: analysis` markerar en kvalificerad kausal eller scenarioanalytisk bedömning och får inte läsas som ett empiriskt frekvenspåstående.

Objektiva påståenden om lag, avgöranden, beslut, datum och statistik ska kunna följas till en primärkälla i `source_refs`. Ett rättsfall beskrivs med korrekt domstol, målnummer, datum, processläge och utfall; partsuppgifter och underrättsresonemang får inte presenteras som överinstansens avgörandeskäl. Sekundärkällor används endast för bakgrund. Frekvens, kausalitet och prognoser kvalificeras när det saknas ett angivet empiriskt underlag.

### CSV och flervärdesfält

Semikolon är filens kolumnavgränsare eftersom det fungerar väl med svensk Excel-konfiguration. Det används därför inte också som intern listavgränsare. I en-rad-per-risk-filen har `rubrik` en egen kolumn, medan separata orsak- och konsekvenskolumner ersätts av en enda kolumn, `bow_tie_json`, med formen `{"causes":[...],"event":{"rubrik":"..."},"effects":[...]}`. Händelsens `event.rubrik` är identisk med den fristående kolumnen `rubrik`; orsaker och effekter bevarar varje posts text, evidenstyp och källreferenser.

Formatet är en semikolonseparerad CSV-dialekt som använder [RFC 4180:s](https://www.rfc-editor.org/rfc/rfc4180) citerings-, citatteckens- och CRLF-regler; RFC:n definierar i övrigt komma som avgränsare. Bow-tie-objektet serialiseras som kompakt JSON i en citerad cell, vilket ger en entydig och förlustfri struktur utan en separat escaping-konvention för fritext. [Microsofts Excel-dokumentation](https://support.microsoft.com/en-us/excel/get-started/import-or-export-text-txt-or-csv-files) bekräftar att semikolon är en vanlig listavgränsare i miljöer där komma används som decimaltecken.

För analysverktyg som föredrar normaliserade tabeller publiceras även `riskregister-items.csv`. Där blir varje utlösande faktor eller konsekvens en egen rad med stabilt `item_id`, `risk_id`, `chart_key`, posttyp, ordning, text, evidenstyp och källor; även källistan finns som förlustfri JSON i `kallor_json`. Webbappen kan exportera både en rad per risk och denna långform för det aktuella urvalet.

Den rättsliga faktagranskningen är ett kvalitetssäkringssteg, inte ett formellt rättsutlåtande. Gällande rätt och projekthändelser är tidskänsliga och ska versionskontrolleras inför varje publicering.

## Återbyggning

```bash
cd mcp-server
npm ci
npm run verify                         # synka, bygg och kör samtliga regressioner
```

## Avgränsningar

Samma avgränsningar som Artefakt B: registret slutar vid praktisk tillståndsmässig byggberedskap. Drift, löpande tillsyn, upphandling, finansiering och kommersiella investeringsbeslut ligger utanför. S1-risker (Miljöprövningsmyndigheten) är fångade där nodernas `s1_delta` markerar förändring; S2 är inte inbyggt.
