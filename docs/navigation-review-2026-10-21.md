# Navigering och visuell samordning – 21 oktober 2026

Genomförd granskning av den publicerade sajten och av ändringen i webbläsare. Besökaren undersöker data; denna ändring påverkar inte riskdata, kontrollkopplingar eller beräkningar.

## 1. Huvudvyer och orientering

**Före:** Riskregistrets sökning och sortering låg i sidhuvudet. Sidhuvudet blev därför högre än i rapporten och analysvyerna. Processkarta, nodbläddrare och statistik var gömda i en separat meny utan bestående markering av aktiv huvudsektion. Motåtgärdernas centrerade flikar följde ett annat mönster.

**Åtgärd:** En gemensam huvudmeny med Risker, Motåtgärder, Processer, Sambandskarta, Rapport samt Data & källor. Under den visas sektionens vyer på samma plats och med samma stil. Risker och motåtgärder har varsin Analys. Registerverktygen ligger i innehållet.

**Kontroll:** Sidhuvudet mäter 172 px vid 1280 px bredd i de granskade huvudvyerna, data-/AI-sidorna och rapportens utskriftsvy. Huvudlänkarnas positioner och ordning är gemensamma. Aktuell huvudsektion och undervy markeras med färg och `aria-current`.

## 2. Länkar, historik och detaljvyer

**Före:** Vyerna ersatte samma historikpost. Webbläsarens bakåtknapp följde därför inte undersökningen. Fristående sidor hade en annan meny och andra återvägar.

**Åtgärd:** Navigationslänkar har verkliga URL:er. Vy-, kapitel- och detaljbyten får historikposter, medan filter uppdaterar den aktuella posten. Bakåt/framåt läser tillbaka URL:ens urval. Process och vald nod finns i länken. Rapporten har både föregående och nästa kapitel. Data, AI och utskriftsvy byggs med samma navigationskomponent.

**Kontroll:** Motåtgärdsanalys med MPM-01 vald → Processer → Bakåt återställde analysvalet. Risksökning → riskdetalj → Bakåt/Framåt återställde sökning respektive detalj. Relativa länkar verifierades även från `data/`, `report/` och `ai-access.html`. En upptäckt felaktig AI-återlänk rättades under granskningen.

## 3. Mobil och visuell användbarhet

**Före:** Menyn fick flera olika rader, små tryckytor och sökfält som flyttade övriga navigationskontroller. Filterknappen var absolut placerad på dator.

**Åtgärd:** Mobilmenyn har sex fasta positioner i två rader. Huvudlänkarna är minst 44 px höga. Sökning och filter har en egen verktygsrad; filterpanelen öppnas direkt under den. Nodlistan använder tangentbordsåtkomliga knappar. Rapportens utskriftsåtgärder följer samma knappstil.

**Kontroll:** Vid 390 × 844 px är sidhuvudet 234 px i risk- och rapportvyn, utan horisontellt sidöverflöde. Sökning, filteröppning/stängning och riskdetaljernas historik har provats. Tillfällig mobilstorlek återställdes efter kontrollen.

## Verifiering och underlag

- `npm run build` och `git diff --check` godkända.
- 173 automatiska tester godkända; ett separat test mot extern MCP-tjänst hoppas över i normal lokal körning.
- Inga konsolfel eller varningar i de granskade appvyerna.
- Risker, riskanalys, rangordning, statistik, kontrollregister, kontrollanalys, processer, nodbläddrare, sambandskarta, rapport, data, AI och utskriftsvy har öppnats i webbläsaren.
- Före-/efterbilder sparade lokalt i `work/navigation-audit-2026-10-21/`: 01–07 före; 08–14 efter. Publicerad version verifieras separat efter deployment.
- Ingen ny mätning startad och inga absoluta mätvärden tillagda. Median/P50-granskningen finns i `docs/runs-import.md`.
