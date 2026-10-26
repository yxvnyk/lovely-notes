# Valentine site

Static site (HTML/CSS/vanilla JS). No build step, no dependencies.

```
index.html  styles.css  script.js  languages.js  .nojekyll
downloads/   <- put YOUR zip here (default: love.zip)
```

## Your ZIP
1. Copy your existing archive into `downloads/` as `love.zip` (do not re-zip or rename contents).
2. Different filename? Edit `CONFIG.zipPath` and `CONFIG.fileName` at the top of `script.js`, and the fallback `href`/`download` on the `#cta` link in `index.html`. Keep the path relative (no leading `/`).

## Test locally
Run `python3 -m http.server 8000` in this folder, open http://localhost:8000. (Opening index.html directly also works for most features.)
Check: click the button (download starts at once), heart burst + message, tiny heart at the bottom right, DevTools > Rendering > "prefers-reduced-motion".

## Deploy to GitHub Pages
1. Repo > Add file > Upload files: drag in everything in this folder (including `downloads/` with your zip and the `.nojekyll` file). Commit to `main`.
   Zip over 25 MB won't upload in the browser: use GitHub Desktop or git (limit 100 MB per file; use a Release for larger).
2. Settings > Pages > Source: "Deploy from a branch", Branch `main`, folder `/ (root)` > Save.
3. Wait ~1 min, open the URL shown (https://USER.github.io/REPO/).
4. Verify: open `<site URL>/downloads/love.zip` directly; it should download a real zip, not show a 404/HTML page. Compare the file size with your original.

## Mini-game (Love Runner)
- Files: `game.js`, `game.css`, `assets/hero.png` (your character, background removed). The download link is hidden until the player wins; it still uses `CONFIG.zipPath` in `script.js` — nothing else to change.
- Difficulty knobs: the `CFG` block at the top of `game.js` (duration, speeds, obstacle spacing, combo steps, hearts speed).
- Swap the character: replace `assets/hero.png` (transparent PNG, any aspect ratio).

## Photos + music
- Obstacles: `assets/obstacles/photo1..5.png` (backgrounds removed). Display sizes are in `PHOTOS` at the top of `game.js`.
- Soundtrack: `assets/music.mp3`; its beat/intensity map is `assets/beatmap.json` (150 BPM, 232 beats). Run time 0 = music second 1.0 (`CFG.music.runAt`).
- If you change the song: `ffmpeg -y -i assets/music.mp3 -ac 1 -ar 22050 /tmp/m.wav && python3 tools/analyze_music.py` (needs numpy + scipy), then re-check `runAt`.
- Without the map or audio the game falls back to a time-based curve and stays fully playable.
- The beat map is loaded with `fetch`, so test via `python3 -m http.server` (not by double-clicking index.html).

## Difficulty / drop settings (top of `game.js`)
`speedStart/speedEnd`, `spacingStart/End/Extra`, `densityStart/End`, `pairFrom`, `tripleFrom`, and `drop` (`at` = music second of the drop, `speedBoost`, `grid`). `flashAt` lists the music seconds with a soft flash (8.0, 9.0, drop).

## Controls & reward
- Tap / click / Space = jump. **Hold** = keep jumping automatically after each landing. A **second press in the air** = double jump (higher) — needed for flying photos (they hover too low to run under and too high for a single jump).
- Splashes: soft colour splash + particles every 0.5 s from the drop on (`CFG.splash.every`, `0` turns them off).
- After winning, the Download button gives a random image (hero or one of the five photos). Typing the secret word (`CFG.secretWord` in `game.js`, currently «суслики») in the box under the button and pressing Download gives the ZIP from `downloads/` (path: `CONFIG.zipPath` in `script.js`). The word is visible to anyone reading `game.js`; this is a playful key, not security.
