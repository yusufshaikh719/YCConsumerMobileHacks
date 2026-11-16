# Ante showcase deck

A 9-slide deck for the YC Consumer Mobile Hackathon. Open `index.html` in any browser. It needs no build step and no network: the fonts and app screens are in this folder.

| Key | Action |
| --- | --- |
| → / Space / click / swipe left | Next slide |
| ← / swipe right | Previous slide |
| Home / End | First / last slide |
| F | Fullscreen |
| N | Speaker notes |

You can link to a slide with `#n`, for example `index.html#5`.

The deck uses the app's own theme: paper and moss colors from `src/theme/tokens.ts`, Bebas Neue and Inter, and the postcard and stamp motifs. Every number on a slide has its source on the same slide.

## Screens

`screens/*.jpg` are captures of the real app on Expo web. To re-shoot them after the app changes, run `capture/run.sh` (see [capture/README.md](capture/README.md)).

## Fonts

Bebas Neue (Dhitiya Rahman) and Inter (Rasmus Andersson), both under the SIL Open Font License. The license texts are in `fonts/`.
