# Miljötillståndsrisker

Publikt riskregister för den svenska miljötillståndsprocessen, med en statisk webbapp på GitHub Pages och en skrivskyddad MCP-server för AI-klienter.

Varje riskhändelse redovisar 3–5 möjliga utlösande faktorer och 3–5 möjliga konsekvenser. Varje post skiljer källförankring från analytisk riskbedömning och kan hämtas som strukturerad JSON eller CSV.

Den senaste importerade BTL-rangordningen kommer från **16 september 2026 kl. 12:28, Europe/Stockholm**, i `nr.getcardinal.io` (experiment **Prel rank**, exekvering **Brave Raven**). Den omfattar 341 av registrets 342 risker. Besökaren kan visa topp 50, filtrera huvudregistret och se de 40 berörda noderna i sju delprocesser. En risk saknar rangordning. Poängen visas som relativ BTL-poäng, inte absolut händelsesannolikhet. Källor, kopplingskontroller och återimport beskrivs i [BTL_RANKING.md](BTL_RANKING.md).

## Publik webbapp och data

- Webbapp: <https://nic-esp.github.io/miljotillstandsrisker/>
- AI-åtkomst och dataindex: <https://nic-esp.github.io/miljotillstandsrisker/ai-access.html>
- Maskinläsbar vägledning (`llms.txt`): <https://nic-esp.github.io/miljotillstandsrisker/llms.txt>
- Riskregister (JSON): <https://nic-esp.github.io/miljotillstandsrisker/data/riskregister.json>
- Riskregister (CSV, en rad per risk med `bow_tie_json`): <https://nic-esp.github.io/miljotillstandsrisker/data/riskregister.csv>
- Orsaker och konsekvenser i normaliserad CSV: <https://nic-esp.github.io/miljotillstandsrisker/data/riskregister-items.csv>
- Utforskningsmodell med motåtgärder, uttryckliga mål och likhetsgrupper (JSON): <https://nic-esp.github.io/miljotillstandsrisker/data/exploration.json>
- Motåtgärder med risk-ID:n, originaltexter och målkopplingar (CSV): <https://nic-esp.github.io/miljotillstandsrisker/data/controls.csv>
- Myndighetskontrollernas ursprungliga kopplingar (CSV): <https://nic-esp.github.io/miljotillstandsrisker/data/authority-controls-source.csv>
- Bedömning av samtliga ursprungliga åtgärdsförslag (CSV): <https://nic-esp.github.io/miljotillstandsrisker/data/authority-assessments-source.csv>
- Myndighetsunderlagets läsanvisning och källor (TXT): <https://nic-esp.github.io/miljotillstandsrisker/data/authority-reading-guide.txt>
- Myndighetsunderlagets version och filkontrollsummor (JSON): <https://nic-esp.github.io/miljotillstandsrisker/data/authority-source-manifest.json>
- Riskmappbara noder (JSON): <https://nic-esp.github.io/miljotillstandsrisker/data/nodes.json>
- Källregister (JSON): <https://nic-esp.github.io/miljotillstandsrisker/data/sources.json>
- Processkartor B00–B70 (JSON): <https://nic-esp.github.io/miljotillstandsrisker/data/process-charts.json>

GitHub Pages-publiceringen använder den ursprungliga adressen ovan och öppnas utan lösenord.

En risk kan länkas direkt med `?risk=RISK-ID`, till exempel:

<https://nic-esp.github.io/miljotillstandsrisker/?risk=R-B10-010-01>

GitHub Actions publicerar de statiska informationssidorna, appen och datautbudet med sex JSON-filer, fem CSV-filer och en TXT-fil. Arkiv, byggmellanprodukter och `node_modules` publiceras inte.

Utforskningsmodellen bevarar varje risks ursprungliga motåtgärdstext och lägger till analytiskt sammanställda gemensamma åtgärder. Varje uttrycklig målkoppling anger vilken orsak, riskhändelse eller konsekvens som avses. Orsaker och konsekvenser behåller sina egna källstatusar även när de visas i samma likhetsgrupp. Grupper med identisk text skiljs från analytiska grupper med liknande innebörd; analytiska kopplingar har inte registrerats som oberoende sakgranskade.

Sammanföringen är partiell: 16 återkommande åtgärder med 118 uttryckliga målkopplingar omfattar 56 av 342 risker. Alla 342 ursprungliga beskrivningar finns kvar. De 63 orsaks- och konsekvensgrupperna består av 51 grupper med identisk ordalydelse och 12 analytiska likhetsgrupper.

Antal kopplade risker beskriver åtgärdens dokumenterade räckvidd i registret. Det visar varken genomförandestatus, uppmätt effektivitet eller beräknad riskreduktion. En likhetsgrupp ger aldrig automatiskt en åtgärd fler målkopplingar. Besökaren kan undersöka och jämföra publicerade samband men inte ändra data.

Myndighetsunderlaget, version **0.10 från 30 september 2026**, tillför 20 föreslagna kontroller med 173 uttryckliga kopplingar till 90 risker. Kontrollistan innehåller därmed 378 poster: 342 ursprungliga beskrivningar, 16 sammanförda åtgärder och 20 myndighetsförslag. Filtrera **Drivs av → Myndigheten** för att först visa huvudscenariots 17 kontroller, 141 kopplingar och 78 risker. Scenarioväljaren ger även tillgång till införandet (1 kontroll, 18 kopplingar) och framtida mandat (2 kontroller, 14 kopplingar), som hålls separata från huvudscenariot. Sambandskartan har motsvarande myndighetsurval och behåller alla 342 risknoder.

Förslagen har status **ej uppmätt**. Varken sannolikheten för införande eller riskreduktion har skattats. Originalåtgärderna har kvar sin fullständiga bedömning och klassificeras inte automatiskt som myndighetsdrivna. Stabila kontroll- och kopplingsnycklar förbereder senare mätresultat utan att skapa resultat nu. Datakontraktet, källspårningen och mätkopplingarna beskrivs i [Myndighetskontroller – datakontrakt](docs/authority-controls-data-contract.md).

## MCP för ChatGPT och andra AI-klienter

MCP-servern finns i [`Artefakt_C_Riskregister/mcp-server`](Artefakt_C_Riskregister/mcp-server). Den körs separat på Cloudflare Workers eftersom GitHub Pages endast kan leverera statiska filer.

- MCP-endpoint: <https://miljotillstandsrisker-mcp.fantastic-pea.workers.dev/mcp>
- Hälsokontroll: <https://miljotillstandsrisker-mcp.fantastic-pea.workers.dev/health>
- REST/OpenAPI-reservväg: <https://miljotillstandsrisker-mcp.fantastic-pea.workers.dev/openapi.json>
- AI-åtkomst på MCP-värden: <https://miljotillstandsrisker-mcp.fantastic-pea.workers.dev/ai-access>

Servern använder publik, autentiseringsfri Streamable HTTP på `/mcp`. Alla verktyg är skrivskyddade och annoterade som icke-destruktiva. Den erbjuder:

- OpenAI-kompatibla `search` och `fetch`
- avancerad filtrering och cursorpaginering via `search_risks`
- fullständig hämtning av alla 342 riskposter via `get_dataset_page`
- noder, statistik, källor och kompletta processkartor
- fullständiga rådata-URL:er via `get_dataset_manifest`

`exploration.json`, `controls.csv` och myndighetsunderlagets fyra källfiler hämtas direkt från GitHub Pages-länkarna ovan. Den befintliga MCP-serverns verktyg, API och risk-/CSV-kontrakt påverkas inte av dessa tillägg; filerna distribueras inte automatiskt till MCP-värden.

Anslut ChatGPT till:

```text
https://miljotillstandsrisker-mcp.fantastic-pea.workers.dev/mcp
```

Aktivera Developer mode i ChatGPT under **Settings → Security and login**, öppna **Plugins**, välj **+**, och ange MCP-URL:en. Starta därefter en **ny konversation** och lägg till anslutningen från menyn **Tools**. Servern kräver ingen OAuth eller API-nyckel.

En publik MCP-URL blir inte automatiskt tillgänglig genom webbsökning. Om en klient säger att anslutningen eller verktyget ”was not provisioned” har den aktiva konversationen inte fått MCP-anslutningen, eller så blockerar klientens konto-/workspacepolicy den. Servern erbjuder därför även vanliga CORS-öppna GET-reservvägar:

- `GET /api/risks?q=&chart_key=&category=&origin=&node_id=&offset=&limit=`
- `GET /api/risks/{risk_id}`
- `GET /data/riskregister.json`, `/data/riskregister.csv`, `/data/riskregister-items.csv`, `/data/nodes.json`, `/data/sources.json` och `/data/process-charts.json`
- `GET /openapi.json`, `/llms.txt` och `/ai-access`

## Utveckla och testa MCP-servern

```bash
cd Artefakt_C_Riskregister/mcp-server
npm install
npm test
npm run deploy:dry
```

Den lokala stdio-transporten finns kvar för MCP-klienter som kör servern på samma dator:

```bash
npm start
```

Starta Worker-miljön lokalt med:

```bash
npm run dev
```

Distribuera till ett autentiserat Cloudflare-konto med:

```bash
npx wrangler login
npm run deploy
```

Testsviten verifierar verktygsscheman, skrivskyddsannoteringar, standardkontrakten för `search`/`fetch`, CORS, rå Streamable HTTP, officiell MCP-SDK-klient och att pagineringen hämtar exakt 342 unika risker.

Kör samma kontraktstester mot en offentlig distribution med:

```bash
MCP_URL=https://miljotillstandsrisker-mcp.fantastic-pea.workers.dev/mcp npm test
```

## Bygg och förhandsvisa webbappen

Webbappen är en fristående HTML-fil med all data inbäddad. Kör följande från repots rot med Node.js 22 eller senare:

```bash
npm --prefix Artefakt_C_Riskregister/mcp-server ci
npm run build
npm test
npm run dev
```

`npm run build` synkroniserar processmetadata, bygger nod-, käll- och utforskningsdata, genererar HTML och förbereder den kompletta statiska webbplatsen i `_site`. `npm test` kör den befintliga MCP-testsviten och tillagda regressionstester. Inga ytterligare frontendpaket behövs.

Förhandsvisningen finns på <http://127.0.0.1:4173/miljotillstandsrisker/> och även på rotadressen <http://127.0.0.1:4173/>. Servern binder enbart till den lokala datorn. `npm run dev` (eller `npm run preview`) serverar senast byggda `_site`; kör `npm run build` igen efter en ändring. Den startar inte en automatisk byggprocess.

Den statiska paketeringen i `scripts/prepare-site.mjs` används både lokalt och i GitHub Actions. Den kopierar endast appen, dokumenterade datafiler och innehållet i `site/`, inklusive logotypfiler. Den kontrollerar att alla nödvändiga filer finns innan den ersätter föregående `_site`.

Varje push till `main` startar [GitHub Pages-arbetsflödet](.github/workflows/deploy-pages.yml), som bygger, testar och stoppar publiceringen om de incheckade genererade filerna inte är synkroniserade. Även `exploration.json` och `controls.csv` omfattas av kontrollen. Ursprungliga risk- och CSV-exporter behåller sina tidigare format.
