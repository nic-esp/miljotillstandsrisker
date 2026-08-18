# Miljötillståndsrisker

Publikt riskregister för den svenska miljötillståndsprocessen, med en statisk webbapp på GitHub Pages och en skrivskyddad MCP-server för AI-klienter.

## Publik webbapp och data

- Webbapp: <https://nic-esp.github.io/miljotillstandsrisker/>
- Riskregister (JSON): <https://nic-esp.github.io/miljotillstandsrisker/data/riskregister.json>
- Riskmappbara noder (JSON): <https://nic-esp.github.io/miljotillstandsrisker/data/nodes.json>
- Källregister (JSON): <https://nic-esp.github.io/miljotillstandsrisker/data/sources.json>
- Processkartor B00–B70 (JSON): <https://nic-esp.github.io/miljotillstandsrisker/data/process-charts.json>

En risk kan länkas direkt med `?risk=RISK-ID`, till exempel:

<https://nic-esp.github.io/miljotillstandsrisker/?risk=R-B10-010-01>

GitHub Actions publicerar endast appen och de fyra JSON-filerna. Arkiv, byggmellanprodukter och `node_modules` publiceras inte.

## MCP för ChatGPT och andra AI-klienter

MCP-servern finns i [`Artefakt_C_Riskregister/mcp-server`](Artefakt_C_Riskregister/mcp-server). Den körs separat på Cloudflare Workers eftersom GitHub Pages endast kan leverera statiska filer.

Servern använder publik, autentiseringsfri Streamable HTTP på `/mcp`. Alla verktyg är skrivskyddade och annoterade som icke-destruktiva. Den erbjuder:

- OpenAI-kompatibla `search` och `fetch`
- avancerad filtrering och cursorpaginering via `search_risks`
- fullständig hämtning av alla 342 riskposter via `get_dataset_page`
- noder, statistik, källor och kompletta processkartor
- fullständiga rådata-URL:er via `get_dataset_manifest`

När Workern har distribuerats ansluter du ChatGPT till:

```text
https://<din-worker>.workers.dev/mcp
```

Aktivera Developer mode i ChatGPT under **Settings → Security and login**, öppna **Plugins**, välj **+**, och ange MCP-URL:en. Servern kräver ingen OAuth eller API-nyckel.

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
MCP_URL=https://<din-worker>.workers.dev/mcp npm test
```

## Bygg webbappen

Webbappen är en fristående HTML-fil med all data inbäddad. Bygg om den från mall och källdata med:

```bash
node Artefakt_C_Riskregister/_build/build_html.mjs
```

Varje push till `main` startar [GitHub Pages-arbetsflödet](.github/workflows/deploy-pages.yml).
