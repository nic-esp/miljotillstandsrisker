# Sak- och rättskällegranskning 2026-08-20

## Omfattning

Granskningen omfattar samtliga 342 riskposter, de 187 processnoderna och 238 kanterna i B00–B70 samt det gemensamma källregistret. Brytdatumet är 2026-08-20. Beslutade regler som träder i kraft senare hålls åtskilda från S0 och anges som S1 eller med uttryckligt ikraftträdandedatum.

## Genomförda rättelser

- felaktiga eller sammanblandade domstolar, målnummer, parter, projekt, datum, processlägen och utfall har rättats;
- lagrum och instanskedjor har uppdaterats mot gällande rätt vid brytdatumet;
- felaktiga, avkortade och missvisande länkar har ersatts;
- partsinvändningar, underrättsmaterial och prognoser har skilts från domstolens eller myndighetens eget avgörande;
- kategoriska frekvens-, kausalitets- och superlativpåståenden utan angivet empiriskt underlag har tagits bort eller kvalificerats;
- processkartan, riskernas nodfält, inbäddade källregister, MCP-data och webbapp byggs nu från samma kanoniska underlag.

Särskilt omfattande rättelser gjordes för Kallak/Gállok, Norra Kärr, Nordkalk/Bunge, SMA Mineral/Stucks, Preemraff/ROCC, Cementa/Slite, Markbygden, Blekinge Offshore, planmålen P 1151-23 och P 5808-23 samt flera felaktigt åberopade MÖD-avgöranden.

## Kvalitetsregler

Ett objektivt påstående om lag, avgörande, myndighetsbeslut, datum eller statistik ska kunna följas till en identifierad källa. Ett avgörande beskrivs med rätt instans, målnummer, processläge och utfall. Sekundärkällor får ge bakgrund men ska inte ensamma bära ett rättsligt påstående när en primärkälla finns.

Maskinella regressioner kontrollerar identifierare, nod- och kantreferenser, källkodsupplösning, externa URL-format, kända rättsfallsrättelser, centrala instanskedjor och att genererade leveranser överensstämmer med kanoniska filer.

## Begränsning och förvaltning

Granskningen är ett kvalitetssäkringssteg och inte ett formellt rättsutlåtande. Riskorsak, konsekvens och motåtgärd kan innehålla uttryckligen kvalificerade professionella bedömningar. Rättsläge, myndighetsorganisation och projekthändelser är tidskänsliga; brytdatum och primärkällor ska därför kontrolleras vid nästa publicering.

## Orsaks- och konsekvensfördjupning 2026-08-24

Samtliga 342 riskhändelser har kompletterats med flera möjliga utlösande faktorer och flera möjliga konsekvenser. Genomgången utgår från risktiteln och riskbeskrivningen som den centrala händelsen och skiljer det som ligger före händelsen från det som kan följa efter den. Varje post är atomär och klassas som antingen källförankrad (`source`) eller analytiskt härledd (`analysis`). En källförankrad post måste peka på en eller flera referenser som redan hör till riskobjektet och innebär att postens rättsliga, processuella eller faktiska premiss stöds där; den är inte nödvändigtvis empiriskt bevis för hela kausalkedjan. En analytisk post är en kvalificerad scenario- eller kausalitetsbedömning och får inte läsas som en observerad frekvens eller säker följd.

Slutversionen innehåller **1 275 utlösande faktorer** och **1 257 konsekvenser**. Av dessa är 452 respektive 374 klassade som källförankrade premisser; övriga är uttryckligt markerade analysbedömningar. Varje risk innehåller 3–5 poster i vardera listan och minst en källförankrad premiss per lista. Listorna är en systematisk redovisning av materiellt relevanta möjligheter, inte ett påstående om att alla tänkbara kausalkedjor kan göras uttömmande.

Efter den första genomgången gjordes en separat post-för-post-granskning av samtliga 2 532 nya texter. Den ledde till 237 riktade korrigeringar av bland annat kausal riktning, rättsföljd, källkoppling, kategoriska sanktioner och texter som egentligen beskrev riskhändelsen eller en motåtgärd. Ytterligare 30 närliggande rättelser gjordes i de äldre sammanfattningsfälten så att de inte motsäger de nya listorna.

Modellen följer [MSB:s riskhanteringsterminologi](https://metodstod-informationssakerhet.msb.se/contentassets/cda18929f96c426c8d6ff1ed136a329c/riktlinje-riskhantering-region-exempel.pdf), där en händelse kan ha flera orsaker och konsekvenser och påverka flera mål. Utvidgningen ändrar inte bedömningen av vilka lagregler eller avgöranden som gäller. Objektiva rättsliga påståenden omfattas fortfarande av kvalitetsreglerna ovan.

Kör hela kontrollkedjan med:

```bash
cd mcp-server
npm ci
npm run verify
```
