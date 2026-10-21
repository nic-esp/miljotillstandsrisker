# Resultat från Cardinal Runs till sajten

Importen är lokal och startar inga mätningar. Cardinal ändras inte. Råexporter, korsreferenser och granskningsrapporter ligger i ignorerade `work/`. Endast den uttryckligen tillåtna projektionen `publication/measurement.json` ingår i sajten.

## Arbetsgång

1. Exportera kompletta JSON-resultat från den nya körningen: BTL likelihood, BTL impact, båda Monte Carlo-stegen, kontrolleffekter och relevanta scenariosteg. BTL:s ranking-CSV räcker inte för absoluta mått eller fördelningar.
2. Lägg filerna i exempelvis `work/ny-matning/`. Bevara originalfilerna. Skapa `manifest.json` enligt `examples/runs-manifest.template.json` och en explicit UUID → sajt-ID-korsreferens enligt `examples/crosswalk.template.json`.
3. Fyll i samma organisation, experiment och execution, tidsperiod, valuta, exponeringsbas, Run-ID, function-ID, färdigställandetid, indata-Run-ID:n och filernas SHA-256. `npm run import:runs -- mapping-version` ger kontrollkopplingarnas aktuella versionshash. `shasum -a 256 work/ny-matning/*.json` kan användas för filerna.
4. Ange `recordPath` och `fields` efter den exporterade JSON-strukturen. Native BTL:s lista heter `ranks`; absoluta värden ligger i `absolute`. Inga JSON-fält gissas utifrån namn eller filernas datum.
5. Kör `npm run import:runs -- inspect work/ny-matning/manifest.json work/measurement-candidate`. Granska `validation.json`, täckning, saknade ID:n, relativa/absoluta statusar, mått och scenarier mot samma Cardinal-körning.
6. Aktivera först efter granskning: `npm run import:runs -- activate work/measurement-candidate`. Tidigare utgåva arkiveras lokalt. Kör sedan `npm run build` och `npm test`, granska lokal förhandsvisning och publicera enligt ordinarie arbetsflöde.

Aktivering ändrar bara lokala visningsdata. Den skickar inget till GitHub och ändrar inte rapportens fastställda manus eller mätutgåva.

## Administratörens val av median eller medelvärde

`publication/presentation.json` styr vilket mått som visas i riskregistret, på riskkorten och i riskanalysen:

```json
{"schemaVersion": 1, "riskStatistic": "median"}
```

Utgångsläget är `median`. En administratör med skrivrätt till repot kan ändra `riskStatistic` till `mean`, köra `npm run build` och `npm test` och publicera ändringen. Inställningen byggs in i sidan; besökaren har ingen växlingsknapp och kan inte ändra den via URL eller sparade webbläsarinställningar. Sajten är statisk och kräver ingen ny inloggning eller server för detta.

Importen bevarar båda måtten oberoende av visningsinställningen. Noll är ett giltigt resultat. Om det valda måttet saknas visas **Median saknas** respektive **Medelvärde saknas**; sajten ersätter inte det med det andra måttet eller en odefinierad punkt. Sortering och täckning följer det valda måttet. BTL:s relativa rangordning påverkas inte.

Medianläget använder den exporterade monetära förlustens P50. Det multiplicerar inte sannolikhetens median med kostnadens median. Samlad median, även per process eller för ett filtrerat urval, kräver en gemensamt simulerad förlust för exakt det riskurvalet. Individuella medianer summeras aldrig. Medelvärdesläget kan summera förlustmedelvärden; ofullständig täckning anges.

Kontrollernas separata analys visar uttryckligen **förväntad förlust/medelvärde** från exporterade scenarier. Den omtolkar inte dessa resultat som medianer. Rapporten behåller sin egen fastställda mätutgåva.

## Stödda Run-slag

| kind | Underlag | Publik användning |
| --- | --- | --- |
| `btl_likelihood` | Komplett BTL `ranks`, fältvägar kan anges | Relativ rang och endast berättigade absoluta mått |
| `btl_impact` | Komplett BTL `ranks` | Absolut konsekvens med deklarerad valuta/enhet |
| `monte_carlo_likelihood` | Typad occurrence med explicit adapter | Händelsesannolikhet eller frekvens, medelvärde och median; annars endast arkivering |
| `monte_carlo_impact` | Kalibrerade monetära exposures med explicit adapter | Kostnad per händelse, medelvärde och median; annars endast arkivering |
| `monte_carlo_loss` | Monetära förlustresultat per risk | Förlustmedelvärde och median samt tillgängligt histogram/P95 |
| `control_effects` | Native `effects` | Latenta effekter med oförändrade riskkopplingar |
| `portfolio_loss` | Gemensam monetär portföljförlust | Totalfördelning för exakt angivet urval och beroendemodell |
| `scenarios` | Exporterade monetära scenarioutfall | Exakta kontrollkombinationer, kvarvarande risk, reduktion och eventuellt känd kostnad |
| `lineage` | Uppströms metadataresultat | Proveniens och privat arkivering |

Likelihood och impact blir aldrig automatiskt en monetär förlustfördelning. Adaptrarna nedan läser exporterade statistikfält; de simulerar inga nya utfall. En eventuell härledning av gemensam förlust från råa dragningar behöver granskas mot den faktiska modellen innan sådana kurvor publiceras.

`identityPaths` kan ange fält för att kontrollera Run-identiteten mot exportens omslag, exempelvis `{"runId":"id","executionId":"execution_id"}`. Använd endast de fältvägar som faktiskt finns. Om resultatfilen saknar omslag ska identiteten och inställningarna dokumenteras från samma Runs-post i manifestet och granskas innan aktivering. Metadata kan inte verifieras mot en export som saknar den.

## Enheter och modeller

### Median/P50 i Runs-exporterna

Kodgranskning 2026-10-21 av den lokala Cardinal-versionen visar följande. De nya mätfilerna har ännu inte levererats, så innehållet måste verifieras mot den faktiskt avslutade körningen.

- Export av en **enskild** Monte Carlo-Run av typen `risk_exposure` skriver CSV-kolumnerna `Risk ID,Mean,P50,P90,P99`. P50 kommer från `data.exposures[].quantiles.p50`. Mass-export av Runs-listan är däremot en förteckning över körningarna, inte deras fullständiga mätresultat.
- Fullständiga Run-data innehåller `data`, `provenance` och `stats`. Den typade occurrence-delen kan innehålla `data.occurrence.results[].probability.median` och `annualRate.median`, med respektive medelvärde, spridning och kvantiler.
- BTL:s förenklade ranking-CSV har `Risk ID,Score,Rank,Uncertainty`, utan median. Ett score eller en absolut punkt får inte märkas som medelvärde/median utan sin dokumenterade definition.
- CSV-exporten tar inte med dimension, enhet, kalibreringsstatus, occurrence-blocket eller lineage. Den granskade implementationen använder dessutom `value || ''`, vilket skriver numeriska nollor som tomma celler. Använd fullständiga data och metadata från samma Run för importen; tolka aldrig tom CSV-cell som noll eller som bevis för saknat resultat.
- Likelihood-exponeringarnas P50 kan vara en relativ diagnostisk rankingfördelning. Den är inte automatiskt median för händelsesannolikheten. Impact-P50 kan vara kostnad per händelse endast när enhet och kalibrering stöder det. Monetär förlust-P50 kräver en förlustfördelning över den angivna perioden.
- Importören bevarar medelvärde och median separat i `summaries`. `Förväntad förlust` betecknar medelvärdet; medianläget använder etiketten `Medianförlust`. `validation.json` redovisar täckning och saknade risk-ID:n för båda måtten i varje dimension.

Kodpunkter i Cardinal: `lib/services/run-service.ts` (`exportRun`), `app/(logged-in)/[orgSlug]/runs/[id]/page.tsx` (CSV-export), `lib/execution/functions/monte-carlo.ts` (exposures och occurrence).

### Explicit import av Monte Carlo-statistik

`examples/runs-statistics-manifest.template.json` visar manifestposter för båda native-adaptrarna och monetära förlustresultat. Mallens identiteter, hashvärden, period och fältvägar måste ersättas efter granskning av den verkliga exporten.

- **Likelihood:** `adapter: cardinal_occurrence_v2` läser `data.occurrence` (kan anges med `occurrencePath`). Kräver `semanticsVersion: v2`, modellversion och samma horisont som manifestet. Med `unit: probability` läses `probability.mean`/`probability.median`; med `events_per_year` läses `annualRate.mean`/`annualRate.median`. `calibrationRunId` ska peka på den importerade, absoluta och kalibrerade BTL-källan, som måste finnas i Monte Carlo-körningens inputkedja. Legacy `exposures` används inte som sannolikhet.
- **Impact:** `adapter: cardinal_impact_exposure` läser poster på angiven `recordPath`. Kräver `unit: SEK_per_event` (eller manifestets valuta), `eligibleForAbsolute: true`, `calibrationStatus: anchor_scaled` och `inputMeaning: currency_per_event`. `mean` och `quantiles.p50` bevaras; relativa eller ej berättigade poster redovisas som uteslutna.
- **Monetär förlust:** `monte_carlo_loss` kräver explicit valuta, horisont och `lossDefinition`. `fields.mean` och `fields.median` anger exporterade fältvägar; standard är `mean` och `p50`. Median kan också anges som `fields.p50`. Om endast sammanfattande statistik finns anges `distribution: false`; annars valideras även histogram och kvantiler. Samma möjlighet finns för `portfolio_loss`. Varken ett saknat medelvärde eller en saknad median konstrueras.
- **Flera urval:** flera `portfolio_loss`-poster kan importeras för olika processer/urval. Varje post kräver exakta `riskIds` och ett `dependenceAssumption`. Dubblerade riskurval avvisas. Sajten använder endast den portfölj som matchar det aktuella urvalet exakt.

Utan en explicit native-adapter arkiveras likelihood-/impact-Monte Carlo med proveniens, som tidigare. De nya adaptrarna är kontrollerade mot Cardinals lokala kod och testfall. De faktiska nya Runs-filerna ska fortfarande verifieras före aktivering.

### Tolkning och beräkningar

- `absolute.unit`: `probability` eller `events_per_year` för händelsemått, `SEK_per_event` (eller vald valuta) för konsekvens. Ett värde över ett i frekvenskolumnen är inte en ogiltig procentsannolikhet.
- Bara `eligibleForAbsolute: true` och `calibrationStatus: anchor_scaled` ger absoluta visningsvärden. Relativa poäng och begränsade/ogiltiga värden förblir separata. Modellkalibrering kallas inte empirisk validering.
- En konsekvenspunkt är inte automatiskt ett villkorat medelvärde. `absolute.statistic: conditional_mean` ska bara anges om definitionen faktiskt stöder det.
- `expectedLossRules` kan explicit tillåta produkten av händelsemåttets **medelvärde** och villkorad medelkostnad, med antagandet `independent_frequency_and_severity`. Båda måste vara definierade som medelvärden. Medianer och odefinierade punkter avvisas. Annars krävs exporterat gemensamt förlustmedelvärde.
- `monte_carlo_loss`: en post per `riskId` med `mean`, `sampleCount`, `p50`, `p95`, `bins: [{lower,upper,count}]`. Fältvägar kan mappas. `sensitivity` är frivillig och innehåller `method` samt `items: [{label,value}]` där värde är en andel 0–1. Ange metodens verkliga betydelse.
- `portfolio_loss`: `riskIds`, `mean` och samma fördelningsfält. `dependenceAssumption` och manifestets exponeringsbas krävs. Portföljens P95 får aldrig ersättas med summerade per-risk-P95.
- `scenarios`: lista med `id`, `title`, `controlIds`, `riskIds`, `referenceExpectedLoss`, `residualExpectedLoss`, `method`, `overlapTreatment`. Kostnad används endast om `costStatus: known`; annars visas okänd även om källan innehåller ett tekniskt nollvärde. `contributions` måste summera till reduktionen för exakt det scenariot. `riskEffects` kan ge referens och kvarvarande förlust per risk.
- Latent `delta` från kontrolleffekter ändrar inga kanoniska målrelationer och blir aldrig direkt en procentuell förlustreduktion. Saknas en exakt scenariokombination visas ingen beräknad effekt av besökarens val.

Råfilernas okända fält publiceras inte. Kända Run-identiteter och resultatmått plockas ut med en explicit fältlista. Fel i identiteter, hash, målrelationer, enheter, horisont, histogram eller angiven lineage stoppar kandidaten. Luckor redovisas; de fylls inte med nollor.
