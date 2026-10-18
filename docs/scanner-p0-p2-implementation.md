# Scanner P0–P2: Umsetzungs- und Validierungsbericht

Stand: 21. Juli 2026

Branch: `codex-scanner-p0-p2`

## Ergebnis

Die in der Analyse priorisierten P0–P2-Massnahmen sind im lokalen Branch umgesetzt. Der Umbau betrifft nicht nur einzelne Filter, sondern die gesamte Kette von Modellinput, Detection und Still-Capture über Worker-Postprocessing und Blob-Lifetime bis zu Review, Export, Fehler-Recovery und Paketauslieferung.

Die wichtigsten messbaren Resultate:

| Messpunkt | Vorher | Nachher |
| --- | ---: | ---: |
| npm-Tarball | 28,123,079 B | 9,914,177 B |
| entpacktes npm-Paket | 95,060,607 B | 25,404,009 B |
| Reduktion | – | 64.7 % Tarball / 73.3 % entpackt |
| ausgelieferte Runtime-Assets | Modell, OpenCV und 6 WASM-Varianten | Modell, Manifest und 2 WASM-Varianten |
| automatisierte Tests | bestehende Basis | 12 Testdateien / 39 Tests |
| synthetisches Qualitätskorpus | keines | 64 deterministische Szenarien |

## P0 – Correctness und Messbarkeit

### Qualitätsbaseline

- Das freigegebene DocAligner-Referenzbild `run_test_card.jpg` ist mit Herkunfts- und Lizenzhinweis als unveränderlicher Golden-Test eingebunden.
- Der Test führt das tatsächlich ausgelieferte ONNX-Modell aus und verlangt Corner-NME `< 0.01`, Polygon-IoU `> 0.95` und Confidence `> 0.5`.
- Ein deterministisches synthetisches Korpus erzeugt 64 gelabelte A4-, Karten- und Belegszenarien mit Perspektive, hellem/dunklem Hintergrund, Schatten, Glare und Farbe.
- `bun run quality:report` liefert einen maschinenlesbaren Report. Aktueller Lauf: 64/64 gültige Geometrien, 64/64 verarbeitete Seiten, 7 erwartete Glare-Warnungen.

### Detector und Geometrie

- DocAligner-Preprocessing folgt dem Referenzpfad: BGR-Kanalreihenfolge und bilineares Resize auf 256 × 256.
- Heatmaps verwenden Thresholding, grösste zusammenhängende Komponente, gewichteten Schwerpunkt und eine vollständige Quad-Confidence.
- Quad-Validierung akzeptiert echte Perspektive und lange Belege, verwirft aber Tiny-, gekreuzte, konkave und ausserhalb liegende Quads.
- Stabilität basiert auf normierter Corner-RMS-Bewegung und Polygon-IoU statt fast nur auf Flächenkonstanz.
- Worker-Nachrichten besitzen Request-ID, Generation, Timeout, Backpressure und Stale-Result-Verwerfung.
- Die Live-Detection läuft mit maximal einer Inferenz und einem 256-px-Frame.

### Blockierungsfreier Capture-Flow

- Kamera und manueller Shutter funktionieren bereits während beziehungsweise ohne Detector-Initialisierung.
- Explizite Zustände unterscheiden Permission, Camera ready, Detector loading, Capturing, Processing, Success und Fehler.
- Der frühere blockierende Flash wurde durch 140 ms nicht-blockierendes Feedback ersetzt.
- Capture- und Processing-Fehler enden sichtbar und typisiert statt lautlos.
- Der reproduzierbare transparente/schwarze Rand im Denoise-Filter ist behoben und getestet.

## P1 – Qualität, Speicher und Performance

### Kameraaufnahme

- High-Resolution-Capture ist nach dem Speicherumbau standardmässig aktiv.
- Die Leiter verwendet zuerst `ImageCapture`, danach verifizierte Track-Constraints und schliesslich den Liveframe als sicheren Fallback.
- Mutex, Generation und Deadlines verhindern verspätete Seiten nach Stop, Close oder Kamerawechsel.
- Native Sensor-Seitenverhältnisse bleiben erhalten; Settings und Capabilities werden ausgewertet.
- Continuous Focus wird angefragt, wenn das Gerät ihn anbietet.
- Die finale Detection läuft erneut auf dem tatsächlichen Still-Bild.

### Qualitätsgate und Postprocessing

- Auto-Capture berücksichtigt Coverage, Quad-Confidence, Schärfe/Bewegung, Belichtung und Glare.
- Das Standardprofil `document` bewahrt Farbe und verbessert Kontrast moderat; zusätzlich stehen `original`, `color`, `grayscale` und `black-and-white` zur Verfügung.
- Perspektivkorrektur, Filter, Qualitätsbewertung, Thumbnail und JPEG-Encoding laufen in einem Processing Worker.
- Die Ausgabe ist auf 8 MP beziehungsweise 3200 px lange Kante budgetiert.
- Eine Seite hält Blobs, ein echtes kleines Thumbnail, normalisierte Ecken, Rotation, Profil, Rezeptur und Qualitätsmetadaten statt dauerhafter Full-Resolution-RGBA-Kopien und Base64-Strings.
- Object-URLs werden bei Replace, Delete, neuem Dokument und Dispose freigegeben.
- Nur die aktuelle und direkte Nachbarseite werden als Vollansicht decodiert.

### PDF

- PDF-Seiten werden direkt aus Blobs und ohne Base64-Zwischenschritt erzeugt.
- Der Browserexport läuft sequenziell in einem eigenen Worker und hat ein Timeout sowie einen Main-Thread-/SSR-Fallback.
- „Scan abschliessen“ und „PDF erstellen“ sind getrennt: PDF-Erstellung schliesst den Scanner nicht mehr automatisch.

## P2 – Reifer User Flow, Lifecycle und Paket

### Review und Recovery

- Unsichere Aufnahmen öffnen standardmässig das Review; konfigurierbar über `reviewAfterCapture: never | quality-warning | always`.
- Vierpunkt-Crop mit Pointer, Tastatur und Lupenansicht.
- Rotation, Retake/Replace an derselben Position, Reorder per Drag oder Tastaturbuttons, Profile und Vorher-/Nachher-Vergleich.
- Pinch-/Wheel-Zoom und Panning, eindeutiges Trash-Icon und Delete-Undo.
- Kamera-Fehler bieten neben Retry einen nativen Fotoimport; importierte Bilder gehen zwingend durch Review/Crop.
- Verlustschutz vor dem Schliessen und ein leerer Preview-State sind vorhanden.

### Accessibility und Host-Integration

- Scanner, Crop und Dateiname sind echte Modals mit Focus Trap, Hintergrund-`inert`, Escape und Fokus-Rückgabe.
- Capture-, Status-, Fehler- und Erfolgsmeldungen verwenden Live-Regionen.
- Touch-Ziele sind mindestens 44 px; Safe Areas, kurze Viewports, Reduced Motion und Reduced Transparency sind berücksichtigt.
- Mobile Review-Werkzeuge scrollen horizontal ohne Seiten-Overflow.
- Alle sichtbaren Texte sind über `messages` ersetzbar; Farben und Radien über Theme-Tokens.
- Neue Hostoptionen: `defaultProfile`, `keepSource`, `exportUi` und `reviewAfterCapture`.
- Neue Events: `statechange`, `qualitychange`, `pagecaptured`, `pageupdated`, `error`, `pdf` und `complete`.
- `status`- und `controls`-Slots sowie die exponierte Methode `importPage(blob)` erlauben angepasste Host-Flows.

### Lifecycle und Auslieferung

- `pause`, `resume`, `stop` und `dispose` sind getrennt; Preview → Scan more behält den Detector warm.
- Track `ended`/`mute`, `devicechange`, Visibility und `pagehide` werden behandelt.
- Runtimepfade sind unter `/nuxt-document-scanner/v0.6.0/` versioniert.
- Produktionsantworten liefern ein Jahr immutable Cache sowie korrekte MIME-Typen für ONNX und WASM.
- Das Manifest enthält SHA-256-Werte der drei binären Runtime-Assets.
- Der Build staged über eine Allowlist nur fünf Dateien: Manifest, Modell, Modelllizenz sowie Single-Thread-WASM mit und ohne SIMD.
- OpenCV und ungenutzte Threaded-/JSEP-WASM-Varianten landen weder im Nuxt-Produktionsoutput noch im npm-Paket.
- COOP/COEP sind nicht mehr erforderlich, da die Runtime bewusst single-threaded läuft.
- Die doppelte globale CSS-Auslieferung ist entfernt; Komponentenstyles und dokumentierte CSS-Variablen sind die einzige Quelle.

## Validierung

### Automatisiert

| Prüfung | Ergebnis |
| --- | --- |
| `bun run lint` | grün |
| `bun run test:types` | grün, inklusive Playground |
| `bun run test` | 12/12 Testdateien, 39/39 Tests |
| `bun run test:quality` | 5/5 Dateien, 17/17 Tests |
| `bun run quality:report` | 64/64 Geometrie und Processing |
| `bun run dev:build` | Nuxt/Nitro Production Build grün |
| `bun run prepack` | grün |
| `npm pack --dry-run --json --ignore-scripts` | 9,914,177 B / 25,404,009 B |
| `git diff --check` | grün |

### Produktionsassets

Gegen den gebauten Nitro-Server geprüft:

- Modell: HTTP 200, `application/octet-stream`, immutable, 4,767,987 B.
- SIMD-WASM: HTTP 200, `application/wasm`, immutable, 10,595,041 B.
- Manifest: HTTP 200, `application/json`, immutable.
- OpenCV und Threaded-JSEP-WASM: HTTP 404.
- Der Runtimeordner im Produktionsoutput enthält ausschliesslich die fünf allowgelisteten Dateien und belegt rund 26 MB.

### Reale Browserstrecke

Im Chromium-Playground mit einer kontrollierten Canvas-Kamera und mit echtem Datei-Upload geprüft:

1. Kamera öffnen und Detector laden.
2. Manuell sowie automatisch aufnehmen und im Worker verarbeiten.
3. Mehrseiten-Review, Crop, Profil, Rotation, Reorder und Delete-Undo bedienen.
4. Zoomzustand und Mobile-Viewport 390 × 844 ohne horizontalen Seitenoverflow prüfen.
5. PDF im Worker erzeugen; Scanner bleibt offen und der Host erhält ein gültiges Blob.
6. „Scan abschliessen“ schliesst sauber, gibt Fokus und Body-Zustand zurück und liefert das Dokument.
7. Permission denied simulieren, Foto importieren und die Seite mit Qualitätswarnung im Review öffnen.
8. Root- und Nested-Modal-Isolation im Accessibility Tree prüfen.

## Noch auf echten Geräten zu validieren

Die Software-Definition-of-Done für P0–P2 ist erfüllt. Nicht seriös lokal simulierbar sind reale Optik, Autofokusgeschwindigkeit, Sensor-FOV, Betriebssystem-Permissiondialoge, iOS-Safari-Speichergrenzen und Low-End-Android-Thermik. Vor Release sollten deshalb mindestens aktuelles und älteres iPhone/Safari, Pixel/Chrome, Low-End Android, Tablet und Landscape mit A4, Beleg, Glare, Dunkelheit, Bewegung und einem 10-Seiten-PDF geprüft werden.

Die Quality-Gate-Grenzen sind bewusst Startwerte. Nach der Realgerätematrix sollten p50/p95 für Shutter-to-thumbnail, Inferenz, Processing, effektive Dokumentauflösung, Peak Memory sowie False Capture/Reject erhoben und die Grenzwerte anhand dieser Daten nachkalibriert werden.

## Lokale Commitfolge

1. `babd21f` – Analyse und priorisierte Zielarchitektur
2. `3f11122` – reale Modell-Golden-Baseline
3. `ec7addc` – Detector- und Projektionsgeometrie
4. `2129897` – Capture-Lifecycle und Still-Capture-Leiter
5. `c1ea3f9` – Blob-/Processing-Worker-Pipeline
6. `294deeb` – korrektives Review und Accessibility
7. `5603e3b` – Runtime-Slimming und synthetisches Qualitätskorpus
8. `4c9f37e` – Recovery, Zoom, lokalisierbare API und Worker-PDF-Flow
9. `d05e5b4` – Runtime-Asset-Allowlist für lokale und veröffentlichte Builds
