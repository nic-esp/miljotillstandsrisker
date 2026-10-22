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

## Privat exportbrygga från nr

Bryggan är förberedd och lokalt testad. Förberedelse, export, granskning och aktivering är separata steg. Inget steg publicerar automatiskt. Ingen mätning startas och Cardinal-koden ändras inte.

### Förbered nu – utan att hämta eller importera resultat

Kopiera `examples/cardinal-bridge-config.template.json` till en privat konfigurationsfil under `work/`. Ange organisationens UUID och slug, experiment-ID och en uttryckligen vald execution. Exporten kräver att execution är avslutad. Den väljer aldrig automatiskt senaste körning. `examples/cardinal-crosswalk.template.json` visar korsreferensernas struktur; använd de verifierade ID-kopplingarna från paritetsarbetet, inte namnmatchning.

```sh
npm run export:cardinal -- prepare work/export-config.json work/export-bridge.txt
npm run export:cardinal -- prepare-loss-cache work/export-config.json work/export-loss-cache.mjs
```

Dessa kommandon skapar bara granskbara skript med privat filbehörighet. De gör inga nätverksanrop, öppnar ingen databas och läser inga resultat. Befintliga hjälpfiler skrivs inte över. Mappningsversionen binds till sajtens aktuella kontrollmål. Om mappningarna ändras måste konfigurationen förberedas igen.

### Exportera senare, när resultat ska hämtas

**Runs, scope och kopplingar.** Granska `export-bridge.txt` i en editor. En administratör kan köra innehållet i utvecklarkonsolen i sin inloggade `https://nr.getcardinal.io`-flik. Det laddar ned ett paket med kompletta Runs, deras uppströms indata och syskon, fryst scope, graf, fullständig strukturell ZIP samt kontrollanalys för båda kontrollbaserna. Skriptet läser inte lösenord, cookies eller API-nycklar. Webbläsarsessionen används bara mot samma värd. Ändra inte webbläsarens säkerhetsinställningar för att köra hjälpen.

Det strukturella ZIP-uttaget kräver Cardinals befintliga superadminbehörighet. Utan den stoppar exporten; en trunkerad kontrollmatris används aldrig som ersättning. ZIP:en arkiveras privat. Importören läser risker, kontroller, risk–kontrollmål, bow-tie-element och processkopplingar utan att extrahera sökvägar eller köra innehåll. Aktuella kopplingar och den historiska körningens scope hålls isär.

**Sparade förlustfördelningar.** Vissa GET-anrop i Cardinal kan köa en förlustsimulering när en cache saknas. Därför använder bryggan inte `risks.list`, `riskPostureKpis`, `portfolioLossDistribution` eller `costProjection`. Den gamla inställningen `includeAnalytics: true` avvisas. `includeControlAnalysis` hämtar en separat granskad läsare som sammanställer redan sparade kontrollresultat utan att köa simuleringar; sätt den till `false` för ett rent arkiv.

`export-loss-cache.mjs` är ett separat administratörsskript för en redan behörig Cardinal-runtime med `postgres`-paketet och befintlig `POSTGRES_URL`. Det läser `loss_model_results` i en **repeatable read, read only**-transaktion. Organisation, experiment, avslutad execution, scope och båda käll-Run-ID:n kontrolleras. Skriptet anropar inga Cardinal-tjänster eller köer. Standardutdata sparas privat som `loss-cache.json`; anslutningsuppgifter ska aldrig kopieras till sajtens repo eller lämnas i chatten. Körningen av detta nya lässkript behöver verifieras vid nästa riktiga export; förberedelsen ansluter inte till nr.

Om ingen sparad förlustmodell finns exporteras detta som frånvaro. Bryggan startar inte en beräkning för att fylla luckan. Native Monte Carlo-Runs innehåller sannolikhets- och konsekvensstatistik; den gemensamma monetära förlustfördelningen ligger i en separat tabell. Det är därför två kompletterande exportunderlag behövs.

### Granska lokalt före aktivering

När exporten senare är beställd och filerna finns:

```sh
npm run import:cardinal -- inspect work/cardinal-export.json work/crosswalk.json work/candidate-unique --loss-cache work/loss-cache.json
```

`inspect` skriver endast en privat kandidat och `validation.json`. Den ändrar inte sajtens aktiva data. Residualbasen är standard; `--basis inherent_no_controls` skapar en separat kandidat för den inherenta basen. Kandidatens katalog måste vara ny. Arkivet bevarar båda baserna oavsett vald projektion.

Korsreferensen innehåller `orgId`, `risks` och `controls` (nr-UUID → sajt-ID), `targets` och `processMappings`. Alla sajt-ID:n och mål måste finnas med. Risk, kontroll och måltyp verifieras mot sajtens kanoniska data. Nya, saknade eller dubbla kopplingar arkiveras och spärrar aktivering tills källmodellen och korsreferensen har stämts av. Importen skriver inte om kontroller, risker eller processer.

Adaptern bevarar medelvärde och median från native occurrence- och impactresultat. Årlig monetär förlust hämtas från den sparade förlustmodellen. Analytiskt medelvärde och simulerat medelvärde hålls isär, även per risk. Portföljens median kommer från den gemensamma fördelningen; individmedianer summeras inte. Bedömningshorisonten och den årliga förlusthorisonten lagras separat. Nollmedian är ett giltigt resultat. Okända kontrollkostnader fylls inte med noll.

Adaptern stöder den granskade sparade modellen `loss-model-v2.1` med dess dokumenterade inställningar. Annan modellversion, seed, antal dragningar eller uppsättning horisonter kräver adaptergranskning; nya format tolkas inte tyst. Äldre redan hämtade analys-API-paket kan fortfarande läsas offline, men bryggan skapar inte nya sådana paket.

`validation.json` redovisar tillgängliga medelvärden och medianer, bortfall, kopplingsskillnader och avstämning av kontrollbidrag. Saknade sparade årsresultat, pågående simulering i äldre exporter, saknad kontrollanalys, kopplingsdrift och kontrolltotaler som inte går ihop spärrar aktivering. Saknade värden konstrueras aldrig.

Hela källpaketet, råa Runs, ZIP, korsreferens och förlustmodell arkiveras med kontrollsummor. Publiceringsprojektionen använder tillåtna fält; råa promptar, kontaktuppgifter och privata beskrivningar följer inte med. Kontrollanalysen behåller sin egen flik. Allokerad kontrollnytta omtolkas inte som marginaleffekten av valfria kryssrutor; dessa kräver separata exporterade scenarier. Scenariounderlagen finns kvar i råarkivet.

### Aktivera som ett separat beslut

Först när kandidaten är granskad och import ska ske:

```sh
npm run import:runs -- activate work/candidate-unique
npm run build
npm test
```

Aktivering kontrollerar åter kopplingsversion, råfiler och kontrollsummor och arkiverar föregående mätutgåva lokalt. Publicering till GitHub Pages görs separat. Median förblir administratörens standard i `publication/presentation.json`; besökare kan inte byta mått. Importen ändrar inte rapportmanus, intervjuer eller rapportens fastställda mätutgåva.

## Cosmic Rhino: offlineprojektion utan ny simulering

Utgåvan den 22 oktober 2026 använder en arkiverad, skrivskyddad databasexport eftersom körningen saknar lagrad gemensam monetär förlustfördelning. `scripts/project-cardinal-snapshot.mjs` är en separat adapter för detta format. Den anropar aldrig Cardinal och skapar inga nya mätningar eller simuleringar.

```sh
node scripts/project-cardinal-snapshot.mjs \
  work/cosmic-rhino-2026-10-22/snapshot.json \
  work/nr-bridge-2026-10-21/crosswalk.json \
  publication/value-policy.json \
  work/cosmic-rhino-2026-10-22/candidate
```

Adaptern kräver slutförd körning, samma organisation och experiment i alla Runs, komplett källkedja, fryst ettårsomfattning i SEK och fullständiga ID-korsreferenser. Risk–kontrollpar och direkta processmappningar måste stämma. Avvikelser på bow tie-elementnivå redovisas separat; sajten behåller sina ursprungliga kopplingar. Effektkällan väljs från scenariokörningens faktiska föräldrar.

I utgångsläget utan införda kontroller hämtas frekvensens median och medel analytiskt från BTL-resultatets kalibrerade lognormala frekvensbedömning. Resultat med kontrollantaganden bevaras separat från `occurrence.results[].annualRate`. Kostnadsfördelningens median är BTL-resultatets kalibrerade `absolute.point`; dess medelvärde är `point * exp(latentStdDev² / 2)`, enligt Cardinals severity-belief-kontrakt. Impact-Monte-Carlos diagnostiska `exposures.mean` är inte detta kostnadsmedel. Förväntad årskostnad beräknas från frekvensmedel och kostnadsmedel under ett explicit oberoendeantagande. Huvudprioriteringen använder `centralCost`, medianfrekvens × mediankostnad, som en separat medianbaserad årlig kostnadsindikator. `ranking` följer denna indikator och `meanRanking` bevarar medelvärdesjämförelsen. Indikatorn är varken ett förlustmedelvärde eller medianen för faktisk årlig förlust. Kontroller jämförs med samma indikator före och efter sina uppmätta logskiften; summorna ska inte beskrivas som nationella nettobesparingar.

`sourceStatistics` bevarar ursprungliga värden. `summaries`, `centralCost`, `expectedLoss` och `review` beskriver publiceringsbeslutet. `publication/value-policy.json` anger redaktionella granskningsgränser; dessa är inte empiriskt fastställda naturliga tak. När ett medelvärde underkänns kan medianen behållas om dess egen storleksordning klarar granskningen. Beskrivningsintervall förs in separat med `apply-description-review.mjs` och ges aldrig automatiskt en mittpunkt. Jämförbar historik har företräde vid skalgranskningen; antal avgjorda ärenden får inte utan vidare ersätta antalet kostsamma förseningar. Källspecifika invändningar visas via `sourceCaveats`.

Granska kandidatens `measurement.json` och `link-audit.json` före aktivering. Kopiera den godkända mätutgåvan till `publication/measurement.json`; rapportens låsta kopia och manus uppdateras tillsammans enligt `report/README.md`. Kör tester, generera PDF och bygg sedan sajten. Fullständiga exporter, intervjudokument och privata korsreferenser stannar i den ignorerade katalogen `work/`.
