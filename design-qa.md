# Design QA — 21 oktober 2026

final result: passed

## Underlag och jämförelsesätt

Godkända källor: `design/storyboards/2026-10-21/risker-och-fordjupning.png` och `riskbild-och-kontrollanalys.png` (båda 1024 × 1536 px), samt `lasrapport.png` (1027 × 1532 px). Dessa är tvådelade storyboards med rubriker och exempeldata, inte fotografier av en enda browserviewport.

Implementationen är den lokalt byggda appen på `http://127.0.0.1:4173/miljotillstandsrisker/`. Kontrollen gjordes i in-app browser via CUA. Ordinarie viewport är 1280 × 720 CSS px, skärmbild 1280 × 720 px, alltså 1:1. Fullbilden `report-cover-final.png` är 1280 × 1061 px. Tillfälliga storlekar användes för exakt jämförelsebredd och responsiv testning, därefter återställdes viewporten till standard.

Källornas respektive app-panel har klippts från storyboarden utan den omgivande presentationsrubriken. Samma innehållsbredd användes vid följande riktade browserbilder:

- Riskregister: källregion 966 × 694 px, browser 966 × 694 CSS px. `work/qa-2026-10-21/matched-compare-risks.png` visar källa och implementation tillsammans.
- Rapportomslag: källregion 984 × 680 px, browser 984 × 680 CSS px. `matched-compare-report-cover.png` visar samma jämförelsebredd.
- Riskanalys: källregion 978 × 679 px, browser 978 × 679 CSS px. `matched-compare-risk-analysis.png`.
- Kontrollanalys: källregion 978 × 692 px, browser 978 × 692 CSS px. `matched-compare-controls-analysis.png`.

De fyra kombinerade bilderna har öppnats och jämförts. Även `compare-risk-detail.png` och `compare-reader.png` har granskats som komponentjämförelser, med dokumenterad skillnad i skalkontext: riskdetaljen behåller befintlig dialogsida och rapporten har nu 23 avsnitt i stället för skissens fem. Dessa två bilder är inte underlag för ett påstående om pixelidentisk browserlayout. Fokusgranskning har gjorts direkt på originalbilderna `risk-detail-final.png`, `mobile-reader-final.png`, `risks-matched-final.png`, PDF-omslag och PDF-sidan med redaktionellt lyft.

## Fynd, rättningar och ny kontroll

1. **P2, mobil kapitelmeny:** en äldre regel för `.rp-toc > .btn` dolde den nya innehållsknappen vid 390 px. Rättad med lika specifik mobilregel. Ny browserkontroll: knappen är synlig, `aria-expanded` växlar, innehållsförteckningen öppnas och aktuellt kapitel 08 visas. `mobile-reader-final.png` visar det rättade läsläget. Ingen horisontell sidöverströmning vid 390 px.
2. **P2, riskregister vid 966 px:** den äldre sidospalten lämnade för lite plats för tabellen. Jämför `tablet-risk-before.png` med `risks-matched-final.png`. Filter är nu infällda även vid mellanbred skärm, men kan öppnas med knappen. Mätt tabellbredd och synlig tabellbredd är båda 928 px; samtliga kolumner ryms. Filterknappen har provats åt båda håll.
3. **P2, kontrollanalys vid 978 px:** nyckeltalen staplades onödigt i två rader. Rättad brytpunkt. Ny mätning visar fyra kolumner om 169,25 px. Slutbilden `controls-analysis-matched.png` och dess kombinerade jämförelse visar rättningen.
4. **P2, PDF-logotyp:** SVG:ns `currentColor` gav svart text på mörk bakgrund vid första rasteriseringen. Originalets textfärg är nu vit i PDF-tillgången. Originalets konturer och övriga färger har bevarats. Slutligt PDF-omslag kontrollerat.
5. **P2, PDF-innehåll:** automatisk innehållsförteckning flöt över till en extra nästan tom sida. Tabellens cellavstånd rättades. Innehållet ryms nu på sida 2, med klickbara kapitelreferenser och korrekta sidnummer. Mallen är 25 sidor. Inga överlappande sidfötter eller ersättningsglyfer hittades.
6. **P2, vänteläggets språk:** formuleringen ”under Period inväntas” ersattes med ”Förlustfördelningen visas efter den nya mätningen”. Ny riskdetaljbild kontrollerad.

Efter rättningarna finns inga öppna P0/P1/P2-fynd i det avsedda vänteläget.

## Fem obligatoriska ytor

- **Typsnitt:** sajtens befintliga Arial/Helvetica-systemstack och 700-viktiga rubriker används. Georgia används för längre rapporttext och redaktionella lyft. Hierarki, radbrytningar, riskrubriker och svenska tecken har granskats på desktop, mellanbredd och mobil. PDF använder Arial och Georgia med inbäddade typsnitt. Storyboardens olika rubrikradbrytningar behandlas som responsiva variationer, inte som identisk satsyta.
- **Avstånd/layout:** tät tabell, tre riskmått, två analyskolumner, sidoställda scenarioval, fyra kontrollmått, editorialt omslag och läsare med kapitelspalt följer målens struktur. Befintlig masthead och dess sökplacering behålls, vilket ger en högre navigationsyta än i vissa skisspaneler. Det är en avsiktlig integration med den befintliga sajten. Nya scope- och scenarioangivelser tar extra höjd för verklig mätspårbarhet. På smala skärmar staplas analysen och tabellerna kan rullas inom sin egen yta.
- **Färger:** befintliga tokens: mörk masthead `#1f272f`, varm bakgrund `#faf9f7`, orange `#ea8f12`, linjer `#cfd4d8`, dämpad text `#62717f`, teal `#1d6362`. Myndighetsurval och scenariofigurer använder teal; topp 50 och vald navigering använder orange. Mätarens browsergröna standardfärg har ersatts med teal.
- **Bilder:** officiella SVG-logotyper återanvänds. PDF-tillgången är en rasterisering av samma original, med vit text mot mörk masthead. Inga ersättningsillustrationer eller genererade varumärken har skapats. Diagram byggs endast från data. Tomlägen ersätter skissens påhittade mätvärden.
- **Text/innehåll:** skissens siffror och påhittade citat har inte kopierats. Faktiskt registerantal är 342 risker och 378 kontrollposter. Rapporten visar arbetsstatus, 19 huvudkapitel och fyra bilagor, samt väntan på mätning och intervjuer. Det redaktionella lyftet är tydligt märkt, och inga intervjuutsagor har konstruerats.

## Funktion och datakontroll

- Samtliga 342 risker finns kvar. Topp 50 ger exakt 50 rader. Utfällbar beräkning och riskens fem flikar fungerar; den egna Analys-fliken visar tydliga väntelägen.
- Motåtgärder har separata Register/Analys-flikar med tangentbordsväxling. Registret innehåller samtliga 378 poster. Analysen visar 17 åtgärder i myndighetens huvudscenario och 20 när alla myndighetsscenarier valts.
- Scenarioval markerar dokumenterade riskkopplingar även utan effektdata. Åtgärdsvalen ändrar inga data. Exakta scenariokombinationer krävs för numeriska effekter.
- Separat testserver och ignorerad HTML-fixture användes för funktionstest med tydligt märkta syntetiska värden. Byte mellan en kontroll, två kontroller och en kombination utan mätunderlag har provats: icke additivt gemensamt resultat används, och tidigare resultat tas bort när kombinationen saknar stöd. Sannolikhet, kostnad, förlust, histogram, P50/P95, känslighetsandelar och figurtabell har provats i webbläsaren. Dessa värden finns inte i `_site` eller publik JSON. Testfliken har stängts och testservern stoppats.
- Process-/topp-50-filter i riskanalysen ändrar urval och täckningsmått. Portföljens P95 visas endast för exakt motsvarande exporterad portfölj, aldrig som en summa av individuella P95.
- Rapportens kapitelval, URL:er, källhänvisningar, mobilmeny och nästa-kapitellänkar har granskats. Rapportens egna låsta mät- och intervjukopior hindrar senare import från att tyst ändra fastställda figurer och citat.
- En risk öppnad ovanpå kontrollanalysen behåller rätt flik och kontrollval även efter omladdning (`controltab=analysis` skiljs från riskens `tab`).
- Browserkonsol: inga fel eller varningar under de provade vyerna och interaktionerna.
- Automatiska tester: 170 passerade, ett befintligt externt endpoint-test överhoppat. Importtesterna täcker bland annat SHA-256, faktisk filarkivering, explicit ID-mappning, enheter, behörighet för absoluta värden, cykelfri lineage, okänd kostnad, exakta scenarier, intervjuprojektion och rapportens editionsbindning.
- Nya Runs och intervjuer är ännu inte tillgängliga. Native BTL- och kontrollresultat stöds med explicita fältvägar. Enbart marginala Monte Carlo-resultat arkiveras; ingen otestad omvandling till monetär förlust görs. Den faktiska nya exportens struktur och analysvärden ska avstämmas när filerna kommer.

## Handoff

Lokal förhandsvisning, importerare och rapportmall är färdiga för granskning. Förhandsvisningen lämnas igång på port 4173. Användaren har den 21 oktober uttryckligen bett att versionen publiceras på den befintliga GitHub Pages-sajten för granskning från en annan dator. Publiceringen görs i en egen återställbar commit; driftkontroll sker efter publicering. Ingen mätning har startats och Cardinal-kod har inte ändrats. Den färdigskrivna resultatrapporten inväntar verkliga mätresultat, intervjumaterial, analys och sakgranskning.

final result: passed
