# Ante showcase deck

A standalone, full-screen slideshow pitching Ante / Habit Pot to the YC Consumer Mobile Hackathon judges. Plain HTML, CSS and JS with no build step and no dependency on the app.

Open `showcase/index.html` in a browser. Fonts ship locally in `fonts/`, so it works offline.

| Action | Keys and gestures |
| --- | --- |
| Next | Right, Down, Space, Enter, Page Down, click or tap, swipe left |
| Previous | Left, Up, Page Up, Backspace, swipe right |
| First / last | Home / End |
| Fullscreen | F |

Each slide has its own URL hash (`#1` to `#12`). The 1920×1080 stage scales to any window and letterboxes on 4:3 projectors. Motion turns off under `prefers-reduced-motion`.

Barlow Condensed and Inter are licensed under the SIL Open Font License 1.1 (see `fonts/OFL-*.txt`).
