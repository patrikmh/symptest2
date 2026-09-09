# Snake Game

A single-file HTML5 canvas implementation of Snake with a few extras: difficulty
levels, level progression, power-ups, particle effects, sound effects via the
Web Audio API, pause, and a persistent high score stored in `localStorage`.

## Run

Open `index.html` in a browser. No build step or server is required.

Controls: arrow keys or WASD to move, `P` / Space to pause, `R` to restart.

## Test

The test suite checks that the HTML document is well-formed and that the
expected features are present.

```bash
# from the repo root
pytest projects/snake-game
```
