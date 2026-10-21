# Resultatimport och rapportproduktion

Status 21 oktober 2026: storyboards för riskkort, samlad analys/kontrollernas egen analysflik och läsrapport är godkända. Användaren gör en ny mätning. Den nya körningen ska vara underlag för siffrorna; den tidigare granskade körningen är endast ett formatprov. Den lokala implementationen är byggd med väntelägen för nya Runs och intervjuer. Resultatrapporten är ännu inte färdigställd.

## Ett gemensamt publiceringsunderlag

Cardinal, vald execution → privata Runs-uttag och registerversion → validering och ID-koppling → publicerbart resultatpaket → riskkort, riskanalys, kontrollanalys och rapportens figurer/tabeller.

Sajten använder en lokalt byggd, versionsbunden datakopia. Besökare behöver inte logga in i Cardinal och inga Cardinal-inloggningsuppgifter läggs i webbplatsen. Den befintliga GitHub Pages-byggkedjan återanvänds. Råuttag med intern körningskontext stannar utanför den publika byggmappen. Endast uttryckligen valda fält publiceras.

## Underlag från noderna

| Källa | Krävs för |
| --- | --- |
| BTL probability / likelihood, fullständigt Run-resultat | Rang, absoluta sannolikheter eller frekvenser, enhet, horisont, osäkerhet, kalibreringsstatus och behörighet för absoluta mått. |
| BTL impact, fullständigt Run-resultat | Konsekvens/kostnad per händelse, valuta, skattningsosäkerhet, status och mätmodell. |
| Monte Carlo, samtliga relevanta Run-utgångar | De simulerade storheter som faktiskt finns, deras fördelningar/percentiler, antal dragningar, inputs och metadata. Likelihood- och impact-output kan vara separata Runs. |
| Control scenario: effects och riskDeltas, med båda dimensionerna där de finns | Kontroll–riskpar, effektens modellskala, uppmätt/identifierad status, datatäckning samt scenarioanknytning. Förändringar i förlust ska använda Cardinals beräkningsregler. |
| Risk-/kontrollregister och bevarad ID-korsreferens | Koppla Runs UUID:n till sajtens stabila risk-, kontroll- och mål-ID:n samt myndighetsklassning/scenario. |
| Körningskonfiguration och lineage | Metodkapitel, inputkopplingar, modellversion, ankare, horisont, datakälla och avgränsningar. |

En provad BTL-CSV innehöll bara Risk ID, Score, Rank och Uncertainty. Den synliga Raw JSON-vyn innehöll även absoluta skattningar och status. Ranking-CSV ensam räcker därför inte. Den äldre organisations-ZIP:en är registerunderlag och får inte antas omfatta alla function/run-resultat.

### Importväg utan ändring i NR

Första versionen använder befintliga exportmöjligheter och fullständiga Raw JSON-resultat från de sparade Runs. Insamlingen kan assisteras i den inloggade webbläsaren. Vi behöver först kontrollera exakt vad den nya körningens exporter innehåller. Samma importerade format kan senare matas genom ett etablerat läs-API om ett sådant finns tillgängligt. Ingen kodändring i NR eller ny behörighet förutsätts.

Varje paket får ett manifest med organisation, experiment, execution, nod-ID, Run-ID, dimension/outputtyp, källans completion-status, schema/metodversion, input-Run-ID:n, exporttid, filnamn och checksummor. Separata explicita input-körningar accepteras bara om lineage visar hur de hör ihop. Importören får inte välja senaste resultat separat per dimension.

Histogram och percentiler hålls lätta för webben. Stora dragningstabeller arkiveras privat. Om Monte Carlo-exporten bara innehåller marginalfördelningar för frekvens och konsekvens måste portföljens förlustfördelning antingen exporteras separat eller beräknas enligt den dokumenterade Cardinal-modellen och märkas som härledd. Den får inte ersättas med summerade P95-värden eller en konstruerad kurva.

## Kontroller vid import

- Alla publicerade risker och kontroller får en explicit match eller en dokumenterad lucka; ingen matchning på namn ensam och ingen tyst bortfiltrering.
- Separera relativ BTL-poäng, sannolikhet under en bestämd period, händelser per år och kostnad vid händelse. Förväntad förlust ska följa den faktiska modellen, inte automatiskt poäng × kostnad.
- Bevara kalibreringsstatus, valideringsbegränsningar och intervall/gränsvärden. Ett färdigt beräkningssteg innebär inte att alla absoluta mått är giltiga eller empiriskt validerade.
- Jämför per-riskvärden och totalsiffror mot samma körnings analysvyer, med uttrycklig täckning och avrundningstolerans.
- Ej uppmätt är inte noll effekt. Okänd kontrollkostnad är inte gratis. NR:s kostnadsplatshållare behandlas som okänd enligt källmarkeringen.
- Återanvänd kontrollernas uttryckliga kopplingar och mätningarnas dimensioner; en effektmätning skapar inte automatiskt nya målrelationer i registret.
- Bestäm vilka processvägar/ärenden som ingår innan kostnader aggregeras. En registersumma för alternativa prövningsspår får inte kallas nationell samhällskostnad eller kostnad för ett typiskt projekt utan exponeringsunderlag.

Fel i identitet, valuta, horisont eller lineage stoppar paketets aktivering. Tydliga ofullständiga mätningar kan visas med status och täckning men ger inte påhittade absoluta värden. Den senast publicerade godkända versionen behålls tills en ny version uttryckligen aktiveras.

## Scenarier och kontrollernas egen analysflik

Motåtgärder får Register och Analys. Analys kan även nås från den samlade analysingången. Myndighetsdrivna åtgärder har eget filter och scenarioangivelse. Val av kontroller ändrar bara jämförelsen.

Effekter på latent modellskala omvandlas inte direkt till procentuell kostnadsreduktion. Vi återanvänder Cardinals verifierade scenarioberäkning, eller exporterade scenarioutfall där det är möjligt. Överlapp och modellens gränser följer med. Saknas stöd för en kombination visas att effekten inte kan beräknas. Jämförelsen ska tydligt visa referens, valda kontroller, kvarvarande risk, reduktion och vilka risker som ingår. Netto/ROI visas först när jämförbara kostnadsuppgifter finns.

## Rapportens innehåll och produktion

Riktmärke: cirka 50–80 genomarbetade sidor, plus tekniska bilagor; omfattningen styrs av frågorna och materialet. Förslag till arbetsrubrik: Miljötillståndsrisker – riskbild, kostnader och myndighetens möjligheter att minska dem.

1. Sammanfattning med de viktigaste belagda resultaten.
2. Bakgrund, syfte och frågeställningar.
3. Tillståndsprocesserna, riskregistret och avgränsning/exponeringsbas.
4. Material och metod: dokumentunderlag, risk- och kontrollkopplingar, faktisk mätkonfiguration, rangordning, absolut kalibrering, konsekvensskattning och Monte Carlo.
5. Resultat: risker, processer, osäkerhet och samlad exponering för den definierade populationen.
6. Myndighetens åtgärder: mandat, status, förväntad reduktion, täckning, överlapp, scenarier och genomförandeförutsättningar.
7. Känslighetsanalys och begränsningar: brister i underlag, kalibrering, antaganden, generaliserbarhet och ej skattade poster.
8. Diskussion: vad resultaten betyder, alternativa tolkningar och vad mätningen inte kan avgöra.
9. Slutsatser och prioriterade rekommendationer, tydligt skilda från modellresultaten.
10. Referenser och bilagor med definitioner, körningsmanifest, fullständiga resultattabeller och teknisk metod.

Arbetet omfattar ett fullständigt skrivet manus. Importören genererar först ett granskningsbart analysunderlag med tabeller, figurer, jämförelser och relevanta källutdrag. Utifrån det skriver vi sammanhängande kapitel. Resultatkapitel och numeriska slutsatser skrivs från den nya mätningen när den är tillgänglig. Bakgrund, disposition, metodram och rapportmall kan tas fram före det.

Sifferpåståenden binds till resultatreferenser/figurer. Citat återges endast från kontrollerade originalkällor med avsändare och hänvisning. Redaktionella slutsatser och rekommendationer identifieras som tolkning. Påståenden om rättsläge källkontrolleras för relevant datum. En sakgranskad rapport kan sedan fastställas för publicering.

Byggd första motor: strukturerat manus för både HTML-läsare och ReportLab-PDF, med samma figurspecifikationer och sajtens godkända manér. Quarto/Typst fanns inte installerat och är därför inte ett krav för den första versionen. Återanvänd samma figurspecifikationer/data som i sajten, med statiska exportversioner för rapporten. Ingen ny CMS-tjänst behövs.

Rapporten är en fast utgåva med angiven dataversion. En ny mätning skapar en ny granskningsversion och en ändringslista: vilka siffror/figurer som ändrats och vilka tolkningar som behöver omprövas. Befintlig godkänd prosa skrivs inte tyst över. Webbrapport, PDF och figurlänkar pekar på samma version. Läsarens scenariofilter ändrar inte rapportens fastställda text.

## Genomförandeordning

1. Bygg importformat, verifiering och mappning för de nya Runs-filerna.
2. Bygg de tre godkända gränssnittsdelarna med tydliga lägen för väntande/saknad mätning; bevara samtliga risker och kontroller.
3. Läs in den nya mätningen, stäm av med Cardinal och färdigställ analysfigurer.
4. Skriv och granska fullständigt rapportmanus mot dessa resultat.
5. Bygg lokal granskningsversion av sajten samt HTML/PDF-rapport och kontrollera både layout och siffror före publicering.

## Verifierade underlag för förslaget

- Befintliga sajtbygget scripts/prepare-site.mjs är en statisk GitHub Pages-byggkedja med uttrycklig lista över datafiler.
- Cardinals befintliga Runs-gränssnitt, BTL-CSV-provexport och synlig Raw JSON har granskats den 21 oktober 2026. Formatprovet utgör inte valet av publicerad mätning.
- Rapportförebilder: Svenskt Näringsliv, En miljöprövning för omställning och nya möjligheter (2021), och Hur kan Sverige bli mer cirkulärt? (2024).
- Quarto Books och Typst är befintliga publiceringsverktyg som kan användas för den gemensamma rapportkällan.


## Längre rapport och intervjuer (godkänt 21 oktober 2026)

Dispositionen har nu 19 huvudkapitel och fyra bilagor. Den nuvarande PDF-mallen är en kortare arbetsutgåva. Slutrapportens längd följer analysbehovet och materialet, med 50–80 sidor plus bilagor som arbetsram. Inga resultat eller citat läggs in för att fylla ut sidor.

Intervjuerna får ett eget metodkapitel och tematiskt resultatkapitel. Godkända citat kan dessutom vävas in i risk-, process- och kontrollkapitlen samt i samlad analys och diskussion. Analysmatrisen binder samman mätresultat, intervjutema, exakta källutdrag, tolkning, motexempel och begränsningar. Intervjuutsagor blir inte automatiskt sannolikhetsskattningar eller nya riskkopplingar.

Fullständiga transkript och identitetsnycklar stannar i privat work/. Endast granskade utdrag och godkänd attribution förs till publik data. Se report/README.md och docs/runs-import.md för de byggda arbetsflödena. En ny rapportutgåva får en låst mätkopia och en ändringslista; befintlig prosa bevaras för redaktionell granskning.
