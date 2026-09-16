# BTL-rangordning från nr.getcardinal.io

Publiceringsunderlaget är `_build/btl_snapshot.json` i `Artefakt_C_Riskregister`. Det innehåller en explicit körning och en kontrollerad koppling till det publicerade riskregistret. Råexporterna ligger utanför Git-repot.

## Körning och verifiering

- Källa: [BTL likelihood ranking – 2026-09-16T10:28:38.078Z](https://nr.getcardinal.io/svenskt-naringsliv/runs/c70cafc9-0636-426e-8b76-0b0e1e3a3433).
- Körnings-ID: `c70cafc9-0636-426e-8b76-0b0e1e3a3433`.
- Experiment: **Prel rank**. Exekvering: **Brave Raven**.
- Den autentiserade körningslistans 20 senaste resultat kontrollerades den 16 september 2026. Detta var den senaste avslutade BTL-körningen för likelihood; senare resultat gällde impact eller Monte Carlo.
- Gränssnittet visade både skapad och avslutad **16 september 2026 12:28, Europe/Stockholm**, utan sekunder. Snapshotens `createdAt` och `completedAt` är därför `null`; den visade tiden och tidsstämpeln i körningsnamnet sparas separat. Körningstid: 1 212 ms; dataversion: 1.
- CSV-exporten från just denna körning innehåller 341 UUID:er med rang, poäng och osäkerhet. Varje numeriskt värde bevaras utan avrundning. Inga senaste-värden från andra körningar blandas in.
- Administratörens riskhanteringsexport skapades **2026-09-16T12:33:26.685Z**. ZIP-arkivet innehåller risker och process-/nodkopplingar, men **ingen körningstabell**. Det kan därför inte själv styrka att körningen är den senaste. Arkivets `risk_rankings.csv` är tom; rangordningen hämtas uteslutande från körningens separata CSV.

SHA-256 för båda exporter och det lokala riskregistret finns i snapshotens `provenance`.

## Koppling mellan källan och registret

Samtliga 341 exporterade UUID:er har kopplats entydigt till lokala risk-ID:n. Källans metadata saknade käll-ID för alla risker (`{}`). Kopplingen använder därför:

- 339 unika, exakt lika titlar.
- En dubblerad titel, **Underrättelse om 'ingen åtgärd' ger falsk trygghet**, avgränsad genom exakt beskrivning till `R-B30-GC160-02`.
- En avvikande titel, **Uppenbart'-kriteriet går inte att styrka i efterhand**, avgränsad genom exakt beskrivning till `R-B40-GE100-01`. Den lokala titeln har dessutom en inledande apostrof.

Alla 341 beskrivningar har sedan jämförts exakt. Alla 341 nod-ID:n har kontrollerats mot `cause_effect_node_mappings.csv`, och processkopplingen har kontrollerats mot `risk_process_mappings.csv` och `org_process_charts.csv`. Ingen godtycklig likhetsmatchning används.

Det publicerade registret innehåller 342 risker. **`R-B40-GN170-02`**, med den andra förekomsten av **Underrättelse om 'ingen åtgärd' ger falsk trygghet**, saknas både i instansens riskexport och i körningen. Den ska fortsätta visas i huvudregistret som **ej rangordnad**, utan konstruerad sista plats eller nollpoäng.

Topp 50 följer körningens exporterade rang 1–50. Dessa risker är kopplade till **40 olika noder i samtliga sju delprocesser**. Nodmarkeringar visar kopplade topp-50-risker och bästa riskrang. De är inte en beräknad sannolikhet för att själva noden störs.

## Vad poängen betyder

CSV-kolumnen `Score` summerar till 0,9999999999999999 för de 341 riskerna. Den används som den exporterade BTL-rangordningens normaliserade poäng, **inte som absolut händelsesannolikhet eller procentsats**. Använd därför rang och relativ poäng i visualiseringar; beräkna inte `Score × 100` som sannolikhet och summera inte poäng till nod- eller processannolikheter.

Den aktuella instansens parametrar anger samtidigt en separat **ankrad kalibrering** (`calibrationMode: anchored`, `semanticsVersion: v2`) med ett års ankarhorisont. Denna metadata är inte samma sak som den normaliserade CSV-poängen:

- 246 risker anges som berättigade till vidare beräkning (`eligibleCount`).
- 80 ligger ovanför den inramade ankarstegen (`unbracketed_above_ladder`).
- 15 har en inkohärent tröskelstege (`incoherent_threshold_ladder`).
- `responseModelValidated` är `false`.

Rangordningen omfattar ändå alla 341 risker. Snapshoten bevarar diagnostiken och hävdar inte att samtliga risker har validerade absoluta sannolikheter. Kalibreringens modellversion är `joint-bt-threshold-survival-log-hazard-normal-v1`; bedömningsprompten är `belief-v2.1`. Modellanpassningen konvergerade på 21 iterationer. Exportens osäkerhetsvärden sparas men tolkas inte som konfidensintervall för händelsesannolikhet.

## Återskapa samma snapshot

Kör från repots rot. Python 3:s standardbibliotek räcker. Ange lokala sökvägar till de två ursprungliga exporter som anges i `provenance`:

```sh
python3 scripts/import-btl-snapshot.py \
  --ranking-csv "$HOME/Downloads/run-BTL_likelihood_ranking___2026_09_16T10_28_38_078Z-c70cafc9-0636-426e-8b76-0b0e1e3a3433.csv" \
  --risk-export-zip "$HOME/Downloads/risk-management-export-2026-09-16.zip" \
  --run-id c70cafc9-0636-426e-8b76-0b0e1e3a3433 \
  --run-name 'BTL likelihood ranking - 2026-09-16T10:28:38.078Z' \
  --source-url 'https://nr.getcardinal.io/svenskt-naringsliv/runs/c70cafc9-0636-426e-8b76-0b0e1e3a3433' \
  --verified-at '2026-09-16T12:37:16Z' \
  --run-metadata Artefakt_C_Riskregister/_build/btl_snapshot.json
```

`--run-metadata` återanvänder den dokumenterade UI-verifieringen för samma körning. För en ny körning ska den ersättas med nykontrollerad metadata, inte kopieras från den gamla. Importen avbryts vid tvetydig koppling, dubbla ID:n, saknade UUID:er, avvikande beskrivning/nod/process, ogiltiga tal eller en icke sammanhängande rangordning. Det är en lokal import; skriptet gör inga nätverksanrop och hanterar inga inloggningsuppgifter.
