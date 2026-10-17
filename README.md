# David Boateng's Simulations

A static site of browser simulations. No backend, nothing is saved.

## Run locally

The simulator loads ES modules and a model file, so it needs a local web server (opening `index.html` directly won't load the 3D model):

```
npx servor . index.html 8080
```

Then open http://localhost:8080.

## Deploy

Push the folder to a GitHub repo and enable GitHub Pages (same as the portfolio). Everything is static.

## Structure

- `index.html`, `site.js`: searchable simulation library. Add new simulations to the `SIMULATIONS` array in `site.js`.
- `about.html`, `donate.html`, `style.css`
- `sims/civic/`: Low-Poly Car Tuning Simulator
  - `physics.js`: performance model (calibrated to the stock EK9)
  - `garage3d.js`: three.js showroom and visual tuning
  - `track.js`, `drag.js`, `carIcon.js`: 2D test drive and drag race
  - `report.js`: photo and tuning-report downloads
  - `civic.bin`: the model, converted from the Onshape OBJ
- `tools/convert-civic.js`: regenerates `civic.bin` from the original OBJ + MTL in `tools/source/` (kept private, not in this repo)
