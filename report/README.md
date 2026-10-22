# Rapportens arbetsyta

`manuscript.json` är den gemensamma källan till webbläsaren, den utskriftsvänliga HTML-utgåvan och PDF-rapporten. Utgåvan den 22 oktober 2026 innehåller 17 huvudkapitel och åtta bilagor, med hela risk- och kontrollregistret, avslutade mätresultat och fem intervjukällor som underlag. Den låsta mätkopian i `measurement.json` bevarar båda kontrollbaserna och använder läget utan införda kontroller för riskkorten och investeringsjämförelserna.

Huvudprioriteringen är en källgranskad kostnadsindikator: medianfrekvens × mediankostnad. De ursprungliga årsmedelvärdena och deras rangordning bevaras som fördjupning och känslighetsjämförelse. Inställningen finns i publication/presentation.json och publiceringspolicyn. Rapporten skiljer dessa mått åt och använder ingen konstruerad årsmedian eller ny Monte Carlo-simulering. Metodbilagorna dokumenterar beräkning, granskningsgränser, känslighet, intervjuer och källkedja.

## När nya resultat kommer

1. Importera och granska den nya mätutgåvan enligt `docs/runs-import.md`.
2. Kör `npm run report:draft -- work/rapport-utkast-NY` för en ny granskningsutgåva med bevarad prosa, låst mätkopia, godkänd intervjukopia och ändringslista. Granska och flytta sedan `manuscript.json`, `measurement.json` och `interviews.json` tillsammans till `report/`. Ange exakt `measurementEditionId`. Granska vilka resultat, figurer och tolkningar som ändras. Läsarens scenariofilter ändrar inte rapporten.
3. Skriv resultat, diskussion, slutsatser och rekommendationer från det faktiska underlaget. Uppdatera faktiska metoder/inställningar och källor. En import ändrar inte befintlig prosa.
4. Sakgranska hela manus. Markera kapitel som `reviewed` först när det faktiskt är gjort.
5. Generera rapporten med `npm run report:pdf`. Det kräver Python med paketen i `requirements.txt`. På denna dator kan den medföljande Python-miljön användas; Matplotlib finns i den privata miljön `work/report-python`, som kan anges med `PYTHONPATH=work/report-python`. Kör sedan `npm run build` och kontrollera HTML och PDF visuellt. Bygget stoppar om PDF och manus har olika checksumma. PDF-filen `output/rapport.pdf` och det äldre filnamnet `output/rapportmall.pdf` får samma innehåll.

Ingen Quarto- eller Typst-installation fanns i arbetsmiljön. Den första versionen använder därför befintlig statisk byggkedja för HTML och ReportLab för PDF, utan ny tjänst. Manuset är strukturerat och kan senare användas av en annan sättningsmotor. PDF:en distribueras som kontrollerad byggartefakt, så GitHub Pages-bygget behöver inte installera Python-typsnitt.

## Intervjumaterial

Förvara fullständiga transkript och identitetsnycklar i `work/`, inte i `report/`, `publication/` eller `site/`. Dessa mappar blir publika. Inga namn, kontaktuppgifter eller fullständiga transkript kopieras automatiskt till sajten.

Skapa en privat strukturerad indatafil enligt `../examples/interviews.template.json`. Ange en godkänd publik attribution (`publicLabel`), roll och exakta utdrag med källposition (sida/stycke eller tidskod). Både intervjukälla och varje utdrag kräver `publicationAllowed: true` och `reviewStatus: approved`. De booleska fälten dokumenterar en verklig granskning; de ersätter den inte. Datum publiceras bara med `publishDate: true`.

Kör `npm run import:interviews -- inspect work/intervjuer/source.json work/interview-candidate`. Granska projektionen och aktivera med `npm run import:interviews -- activate work/interview-candidate`. Inga externa AI-anrop görs, och ingen uppladdning sker.

Utdrag kan knytas till `topicIds` (kapitel-ID), `riskIds`, `controlIds` och `processIds`. Ta med den godkända intervjukopian i rapportens granskningsutgåva (`report/interviews.json`); då visas utdragen i relevanta kapitel. En publicerad rapport läser från sin egen källkopia, så en senare intervjuimport ändrar inte fastställda citat. Ett explicit `quote`-block med `excerptId` ger ett redaktionellt valt citat. Texten hämtas från samma källa, så den behöver inte dupliceras i manuset.

Tematiska **fynd skrivs och granskas** som poster i `findings`: `id`, `title`, `interpretation`, `chapterIds`, `excerptIds`, `riskIds`, `controlIds`, `relationship` (samstämmighet/skillnad/lucka), `counterEvidence`, `limitations`, och vid numerisk koppling `measurementEditionId`. Blocktypen `integration` visar dessa i kapitlet. Citaten är belägg; tolkningen står för sig. Mätfynd kan länkas till risker/åtgärder utan att intervjuutsagor blir nya sannolikheter eller kontrollkopplingar.

## Manusblock

`p`, `h3`, `note`, `highlight`, `quote`, `figure`, `table`, `integration`, `equation`. Text är ren text och escapes vid rendering. Ekvationer har en tillgänglig textformel, en förklarande bildtext och valfria LaTeX-rader som sätts till SVG/PNG vid PDF-bygget. Källhänvisningar anges som `sourceIds` som måste finnas i rapportens källregister. Endast HTTPS-länkar till externa källor tillåts.

Statusar: `draft`, `awaiting_measurement`, `awaiting_interviews`, `awaiting_integration`, `reviewed`, `published`. `published` visar ingen statusetikett och innebär inte extern sakgranskning eller respondenternas godkännande. Dispositionen är utbyggbar; nya tematiska intervjuavsnitt kan läggas till utan att bygga om läsaren.

## Värdegranskning och åtgärdsjämförelser

`publication/value-policy.json` väljer basen utan kontroller. Skevhet eller hög årskostnad räcker inte som uteslutningsskäl; skala, absolut kalibrering och specificerade populationsproblem granskas separat. `publication/description-review.json` dokumenterar 198 granskningar och bevarar intervall utan att skapa medelvärden eller medianer.

Den reproducerbara offlineordningen är `scripts/project-cardinal-snapshot.mjs`, därefter `scripts/apply-description-review.mjs`. De behöver det arkiverade exportunderlaget och dess matchningstabell. Kopiera den granskade mätningen till rapportens låsta kopia, uppdatera manuset och bygg PDF före webbplatsen. Ingen av dessa operationer startar en mätning.

`investment_model.mjs` omvandlar identifierade logaritmiska skift till jämförelser från läget utan kontroller. Spridningen hålls konstant och interaktioner skattas inte. Okända effekter och genomförandekostnader lämnas odefinierade; negativa bidrag bevaras. Fristående belopp summeras inte till kombinationer.

Källgranskningen 22 oktober 2026 ligger i `publication/source-review.json`. `apply-source-review.mjs` beräknar aritmetiska mittpunkter av jämförbara beskrivningsintervall enligt användarens val och bevarar alla råa modellvärden. Rapportens huvudmått blandar dessa tydligt märkta beskrivningsskattningar med kvarvarande modellmedianer; det får inte kallas en förlustmedian eller en observerad årskostnad.
