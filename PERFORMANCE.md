# Games website performance improvements

Tested on 8 and 9 October 2026. Project: `games-gdgocensaf`.

## Live deployment results, 9 October 2026

Published to https://games-gdgocensaf.web.app/ and verified on the live Firebase site. Three cold-load mobile Lighthouse audits were run sequentially before deployment, and three after deployment, with the same browser, machine and audit settings. These are lab measurements of the production URL, not real-user field data or a guarantee of gameplay FPS on every phone.

| Metric (median of three runs) | Before deployment | After deployment |
| --- | ---: | ---: |
| Performance score | 66/100 | 99/100 |
| First contentful paint | 2.96 s | 1.04 s |
| Largest contentful paint | 3.57 s | 1.85 s |
| Speed index | 5.95 s | 3.07 s |
| Total blocking time | 558 ms | 0 ms |
| Cumulative layout shift | 0 | 0 |

Before scores were 66, 70 and 65; after scores were 95, 99 and 99. Median LCP decreased by approximately 48%. All six audits completed without runtime errors or warnings. Reports are `../.performance/deployed-before-1.report.html` through `deployed-before-3.report.html` and the corresponding `deployed-after-*` reports. Structured metrics are in `deployed-before-metrics.json` and `deployed-after-metrics.json`.

Live browser verification passed all four pages and both themes, camera capture, drawing/JPEG export, 3×3 and 4×4 shuffled puzzles, valid cube solving/playback and invalid corner rejection. Twelve live application files matched local source hashes. The CDN's actual HTML/script, image, font and model caching headers matched the configuration. Results are in `../.performance/live-release-check.json`.

Corrected the hidden-directory exclusion rule after discovering that the previous hosting rule included `.git` contents. The final deployment contains 108 website files, with no repository internals. `.git/HEAD`, `.git/config`, `.firebase/hosting..cache`, `PERFORMANCE.md`, `firebase.json` and `.firebaserc` now return HTTP 404.

## Earlier performance-only benchmarking

The deployed hub initially scored **64/100** in a mobile Lighthouse audit (LCP 3.86 s, FCP 3.13 s, TBT 682 ms). The PageSpeed Insights public API returned HTTP 429, so the audits used the local [Lighthouse CLI](https://developer.chrome.com/docs/lighthouse/overview/), the same audit engine used by PageSpeed Insights.

For a fair comparison, the original source snapshot and optimized source were then served through Firebase's local hosting server with compression. Three cold-load mobile Lighthouse runs were performed sequentially for each version, on the same computer with default mobile simulation. The medians are below. These local results are not a post-deployment measurement of the public site.

| Metric | Original local version | Optimized local version |
| --- | ---: | ---: |
| Performance score | 84/100 | 99/100 |
| First contentful paint | 2.78 s | 1.23 s |
| Largest contentful paint | 3.18 s | 2.12 s |
| Speed index | 5.56 s | 2.21 s |
| Total blocking time | 0 ms | 0 ms |
| Cumulative layout shift | 0 | 0 |

All three optimized runs scored 99. Original scores were 87, 84, and 84. Scores vary with hardware and browser conditions; repeat on the public site after deployment.

The dense drawing benchmark used 120 strokes with 600 points per stroke, including erasers, and measured CPU command submission over 30 frames. The final run's median decreased from 9.3 ms to 0.6 ms. This measures stroke-rendering work, not an end-to-end gameplay FPS guarantee.

## Changes

- Self-hosted the same Google Sans, Inter, and JetBrains Mono font faces and unicode subsets. Kept each page's original available weights, including the camera pages' original weight matching. Added the original font licenses and content-hashed font filenames.
- Removed duplicate Google Fonts loads and CSS imports; preloaded the primary font and deferred nonessential scripts.
- Compressed all PNG logos losslessly: 167,786 to 116,352 bytes (**30.7% smaller**), retaining the 800 × 800 resolution and every decoded pixel. All games reuse the hub logo URL.
- Cached exact drawing paths, including incremental paths for growing strokes. Stroke order, curve geometry, widths, eraser compositing, and export rendering remain intact. Undo/clear allow unused caches to be garbage collected.
- Moved the unchanged Kociemba solver to a worker with the original engine as a fallback. Results for a cube edited during a solve are discarded rather than applied to a different cube.
- Moved the unchanged background shader to an OffscreenCanvas worker where supported, with a tested main-thread fallback. Preserved every shader parameter, resolution limit, animation rate, and theme transition. Removed per-frame resize reads and redundant color allocations, and pause it in hidden tabs.
- Prevented duplicate camera-processing loops, reuse initialized detectors, skip inference on an unchanged video frame or hidden tab, and share hand-tracking assets between camera games. Camera dimensions, full-complexity models, detection thresholds, gesture rules, and photo dimensions remain unchanged.
- Configured [Firebase caching](https://firebase.google.com/docs/hosting/full-config#headers): HTML and application scripts/styles revalidate; vendor models cache for seven days; PNGs cache for one day; hashed fonts cache for one year. Documentation, logs, and development dependencies are excluded from hosting.

## Verification

- All four pages loaded without application JavaScript errors or failed application resources.
- Eight original/optimized screenshot comparisons (four pages, light and dark) were pixel-identical with decorative animation time frozen. Layouts also matched.
- Dense drawing output matched the original pixel for pixel, including erasers. A further 320 growing-stroke frames matched at normal and doubled canvas scale. Undo, clear, brush/template controls and JPEG export passed.
- Camera tests used Chromium's synthetic camera: both detectors loaded; drawing/export worked; Puzzle Cam created 9 and 16 pieces; dragging and repeated camera startup worked. Actual hand/face recognition on physical phones still needs a real-device check.
- Four fixed cubes produced solutions that were checked by applying the moves with the unchanged min2phase engine. Next/previous playback passed. Missing-worker and worker-load-failure fallbacks passed.
- Background worker, main-thread fallback and worker-load-failure fallback passed theme and resize checks, including the original 1.5 device-pixel-ratio cap.
- Original solver, vendor models, vertex shader, and fragment shader are byte-for-byte unchanged.
- All changed JavaScript passed `node --check`. The existing trailing blank line in `rubiks_solver/style.css` was preserved from the user's working tree.
- Hosting cache patterns were checked against representative production URL paths. The Windows hosting emulator does not correctly match some custom header globs; the actual CDN headers were subsequently verified after deployment on 9 October.

## Requested game fixes, 9 October 2026

These subsequent edits intentionally change puzzle placement and shuffling as requested; the pixel-identical comparisons above describe the earlier performance-only changes.

- Moved Puzzle Cam's difficulty selector above the board: top-right on desktop, under the instructions on smaller screens. Shuffled piece identities into visible trays instead of source-photo order; preserved the captured photo resolution and each piece's correct destination. Fixed 4×4 sizing and placement on resize, and return displaced pieces to their trays.
- Rubik's engine errors are now validation messages, never animation moves. `Error 4` means corner sticker combinations are missing or duplicated, even when all six color counts equal nine. Invalid cube, flipped edge, twisted corner and parity cases each show an explanation.
- Editing, resetting or rescanning invalidates the old solution and pending animations. Playback Reset restores the solve input; move-ribbon navigation rebuilds the corresponding cube state.
- Browser checks cover both puzzle sizes at seven viewport sizes, 100 shuffles per layout, dragging, resize, displacement, complete puzzle assembly and scatter reset. Both worker and fallback solve paths reject impossible corners and solve valid cubes.
- All 18 UI move permutations match min2phase independently. A complete 20-move solution reaches a solved cube; reverse playback restores the input. Reset, ribbon navigation, canceled turn animations, real engine error codes 1–6 and malformed/search-limit responses passed. Scripts and results are `../.performance/user-fixes.cjs`, `user-fixes-results.json` and `rubiks-playback-check.cjs`.
- Removed the blue hand-pinch marker from Puzzle Cam, including after completion. Gesture controls are unchanged. `../.performance/dot-check.cjs` verifies transparent pixels at the old marker position in both puzzle and solved states, and checks gesture pickup, dragging and placement.

## Artifacts and reproduction

Full Lighthouse HTML/JSON reports, screenshots, source snapshot and browser checks are in `../.performance/`, outside the hosted project. The final reports are `firebase-before-1.report.html` through `firebase-before-3.report.html`, and `firebase-after-1.report.html` through `firebase-after-3.report.html`; structured metrics are in `final-audits.json`.

Run a new audit against the public site after deployment:

```powershell
npx lighthouse https://games-gdgocensaf.web.app/ --only-categories=performance --chrome-flags="--headless" --output=html --output=json --output-path=games-performance
```

## Deployment status

**Published and verified on 9 October 2026** at https://games-gdgocensaf.web.app/. To publish future changes from the `projects` directory:

```powershell
firebase deploy --only hosting --project games-gdgocensaf
```

The live score and Cache-Control headers on the hub, logo, hashed fonts and a MediaPipe model have been verified for this release. Whenever a vendor model is replaced in a future change, version its URL to avoid mixing old cached assets with a new runtime.
