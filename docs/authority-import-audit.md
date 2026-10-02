# Myndighetskontroller: oberoende importkontroll

Kontrollerad 2026-10-02 mot arbetskopians kanoniska riskregister, `riskregister-items.csv` och `mappable_nodes.json`. Kontrollen avser dataintegritet och referenser. Uppgifterna om mandat, rättsläge, lämplighet och möjliga effekter är den bifogade analysens bedömningar; denna kontroll innebär ingen ny rättslig prövning eller effektmätning.

## Resultat

Inga referensfel eller textavvikelser hittades. CSV-filerna återlästes som UTF-8 med BOM och semikolon. Alla 173 kopplings-ID är unika, liksom samtliga kontroll–målpost-par. Alla 342 risker har exakt en åtgärdsbedömning.

| Urval | Kontroller | Kopplingar | Unika risker | Unika processnoder |
|---|---:|---:|---:|---:|
| Hela katalogen | 20 | 173 | 90 | 58 |
| S1, beslutat uppdrag enligt underlaget | 17 | 141 | 78 | 54 |
| Införande, utanför stabilt S1 | 1 | 18 | 9 | 9 |
| Framtida mandat, ej beslutat enligt underlaget | 2 | 14 | 6 | 5 |

De 173 kopplingarna avser 165 orsaker och 8 konsekvenser. De omfattar 172 unika målposter och 95 unika kontroll–risk-par. Samma målpost, `R-B10-080-03:trigger:03`, har både MPM-04 och MPM-F02; detta är två olika kontroller i olika scenarier, inte en dubblett att ta bort. Scenariernas riskantal kan inte summeras: två S1-risker finns också i införandescenariot, och en av dessa finns även i framtidsscenariot.

Följande har jämförts rad för rad:

- Risk-ID, titel, process-ID, nod-ID och nodetikett mot riskregistret.
- Målpost-ID, typ, ordning, exakt text, evidensmarkering och källreferenser mot alla 2 532 kanoniska orsak-/konsekvensposter; även item-exportens texter och ordning har jämförts med riskregistrets original.
- Samtliga originaltexter i `mitigation` mot de 342 bedömningarna och alla 173 kopplingsraderna.
- Anpassade respektive självständiga kontroll-ID i bedömningarna mot de faktiska kopplingarna.
- Att varje kontroll bara förekommer i ett scenario och att kontrollens gemensamma metadata är identiska mellan dess kopplingsrader.
- Att alla konsekvenskopplingar har relationen ”Begränsar följd”, och inga orsakskopplingar har den relationen.

## Viktiga skillnader för import och visning

De 20 posterna är myndighetsdrivna **föreslagna kontroller**. Deras införande och effekt är inte verifierade. Alla 173 rader anger att kvantifierad effekt inte har skattats. En frånvarande mätning ska därför vara tom/ej mätt, aldrig 0 procent.

Myndighetskategori, scenario, genomförandestatus, analysens mandatbedömning och framtida effektresultat är olika attribut. Att ett kontrollförslag ligger i underlagets S1 betyder inte att kontrollen redan är införd eller att dess effekt är känd. Underlaget innehåller ingen numerisk genomförandesannolikhet eller prioriteringspoäng som kan användas för en sådan sortering.

Bedömningen av den ursprungliga motåtgärden gäller **vem som kan utföra just den åtgärden**, inte om hela risken är opåverkbar för myndigheten. Av de 254 originalförslag som bedömts ligga utanför myndighetens kontrollansvar har 17 ändå en separat, självständig myndighetskontroll. Originalförslag och nya myndighetskontroller ska bevaras som separata poster med sina uttryckliga relationer.

Fältet `mojlig_kontrollfamilj_utan_ny_koppling` är ifyllt för 32 risker. Dessa allmänna möjligheter är inte nya kopplingar och ska inte räknas in i täckning, grafkanter eller senare effektberäkning. De 134 anpassningsraderna avser 68 risker; de 39 självständiga förslagsraderna är en annan relationsklassificering.

`atgardsreferens`, exempelvis `R-B10-030-01:mitigation`, är en härledd referens till ett fält. Den är inte ett kanoniskt `item_id`. Däremot är `malpost_id` ett kanoniskt ID som ska sparas tillsammans med appens eventuella interna orsak-/konsekvens-ID. Kopplings-ID och originaltexter bör bevaras för att mätresultat senare ska kunna knytas till rätt version.

Riskens processnod anger var risken hör hemma. Den anger inte nödvändigtvis var eller när kontrollen utförs. Bevara därför frekvens/utlösare och tillämpningsvillkor separat.

## Minsta förberedelse för kommande mätningar

Spara kontrollens stabila ID, ägare/drivande aktör, scenario, föreslagen status och källversion. På varje koppling behövs stabilt kopplings-ID, risk-ID, kanoniskt målpost-ID, måltyp, kausal hypotes, tillämpningsvillkor, ansvarsgräns, S0/S1-avgränsning samt källspårning. Det räcker nu att ange `not_measured` och hålla kvantitativa resultat tomma; inga effekter behöver eller bör beräknas vid importen.

En framtida mätpost bör vara separat från kontrollen och kunna ange:

- Vilken kontroll/kombination och vilka kopplingar, scenarier och dataversioner som mättes.
- Population/ärendeportfölj, behörig exponeringsandel, period och tidshorisont.
- Utfallsdefinition och enhet, S0-baslinje, S1-resultat, osäkerhet och metod.
- Mätstatus, datum, underlag och koppling till gemensam effekt-/förlustkedja.

Riskrang, antal kopplingar och berörda processnoder är inte mått på riskreduktion. Orsakspåverkan och konsekvensbegränsning måste kunna mätas olika. Resultat för enskilda rader eller överlappande kontrollpaket kan inte utan vidare summeras. En risk utan koppling har ingen tilldelad effekt i denna katalog; det bevisar inte noll indirekt effekt.

## Reproduktion

Kör `python3 scripts/audit-authority-source.py` för att granska de versionshanterade källfilerna i `Artefakt_C_Riskregister/_build/authority-inputs`. Ange `--source-dir /sökväg/till/källfilerna` för att i stället granska en annan kopia. Skriptet är läsande och returnerar status 1 vid en integritetsavvikelse. Det utför ingen webb-/rättskällekontroll.

SHA-256 för de mottagna filerna:

| Fil | SHA-256 |
|---|---|
| `lasanvisning_och_kallor.txt` | `29d25eac834bfef799f7b4564364c9d0c0b87cdc4e576ed28fc9fb658f935a22` |
| `myndighetskontroller_riskkopplingar.csv` | `4911a40a843a5d00024eb08a9da7142aaf483155006f53c467a3820405f97b7b` |
| `atgardsforslag_bedomning.csv` | `e568586373ab080168ad97265b72eadaf0edcd22ced3c32e18c2c87bfe986d6f` |

Den fjärde fil som läsanvisningen nämner, `risker_tackning_och_avgransning.csv`, ingick inte i användarens tre bifogade filer och har inte granskats. De befintliga 342 riskerna och deras ej kopplade orsaker/konsekvenser ska därför fortsatt behållas utan att den saknade filens bedömningar antas.
