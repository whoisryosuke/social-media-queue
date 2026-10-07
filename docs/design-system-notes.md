# Design system notes (`daw-preset`)

User-provided preset at `apps/web/src/theme`, wired as the sole entry in
`panda.config.ts` `presets`. Regenerate with `pnpm --filter web prepare`
(output `apps/web/styled-system`, git-ignored). Rule: use only these
tokens/recipes; no hard-coded hex/px (log exceptions in PROGRESS.md).

## Colors

- Base `colors` token holds only `current`, `black`, `white`, `transparent`.
- All palettes are **semantic tokens** (`semanticColors`): 33 palettes
  (`tomato red crimson pink plum purple violet indigo blue cyan teal green
  grass orange brown sky mint lime yellow amber gray mauve slate sage olive
  sand bronze gold ruby iris jade`), each a 12-step Radix-style scale
  (`{palette}.1` … `{palette}.12`).
- Every step has `base` (light) and `_dark` values → **light/dark mode**
  supported via Panda's built-in `dark` condition. No extra setup needed;
  use `colorPalette` + steps (e.g. `gray.11`) so components adapt.
- `staticCss` in `panda.config.ts` generates all `colorPalette` classes
  dynamically so palette-switching components (e.g. Button) work.

## Typography

- `fonts`: `heading`/`body` = Instrument Sans Variable; `mono` = IBM Plex Mono;
  plus system `sans`/`serif` stacks. Semantic `fonts.body`/`fonts.heading`
  → `{fonts.sans}`, `fonts.code` → `{fonts.mono}`.
- `fontSizes` 0–13 (0.5rem–8rem); `fontWeights` thin–black; `letterSpacings`
  tighter–widest; `lineHeights` none–loose.
- `textStyles` xs–9xl (Tailwind-like scale) usable via `textStyle` prop.
- Recipe `text` (base reset: inherit color, margin/padding 0) with
  `fontFamily` variant `body | mono`.

## Spacing / sizes / layout

- `spacing` 0–96 (0.25rem base scale, Tailwind-like).
- `sizes` = spacing + `xs`–`8xl` (20rem–90rem), `prose` (65ch),
  `full/min/max/fit`.
- `breakpoints`: sm 640 / md 768 / lg 1024 / xl 1536 / 2xl 1800 (note: no
  default `md:768…xl:1280`; xl jumps to 1536).
- `containerSizes` xs–8xl for the `container` pattern.
- `aspectRatios`: square, landscape 4/3, portrait 3/4, wide 16/9,
  ultrawide 18/5, golden.
- `borders`: only `none` — use `borderWidth` + `borderStyle` directly.
- `radii` 0–8 (0–2rem) + `full`; `shadows` 2xs–2xl + inset variants;
  `blurs` 0–6; `zIndex` semantic: `interactive/uiLow 300 / uiMid+interactive
  420 / uiHigh 500 / drag 710 / popup 999 / top 9999`.
- Motion: `easings` (default/linear/in/out/in-out), `durations`
  fastest–slowest (50–500ms), `keyframes` + `animations` (spin/ping/pulse/bounce).

## Recipes

- `button` is a **slot recipe** (`container` + `icon` slots). Variants:
  `variant: default (gradient) | outline | ghost`, `size: small | medium |
  large | xl`. Default `colorPalette` is `gray`; set `colorPalette` prop for
  colored buttons (e.g. `colorPalette="blue"`). Uses `bgGradient="to-b"` +
  `gradientFrom/gradientTo` + 1.5px borders; disabled state handled.
  Render via generated `button` recipe from `styled-system/recipes`
  (see `Button.tsx` primitive).
- `text` recipe as above.

## Patterns & conditions

- Panda core patterns available: `stack`, `hstack`, `vstack`, `grid`,
  `flex`, `container`, `center`, `spacer`, `divider`, `aspectRatio`, etc.
  (from `styled-system/patterns`).
- Conditions: responsive breakpoints above, `_dark` / `_light`,
  `_hover/_active/_focus/_disabled` states, `aria-*` selectors.
- `jsxFramework: 'react'` is set, so `styled-system/jsx` (`styled`, `Stack`,
  …) can be used in React islands.
- Extra: `styles/panel.style.ts` exports a `panelStyle` (gray gradient
  surface, radius 4) for card-like surfaces.

## Gaps / gotchas

- No semantic `success/warning/danger` aliases — use palettes explicitly
  (e.g. `green`/`amber`/`red`) until/unless added to the preset.
- Preset was authored with `bgLinear` (renamed `bgGradient` in Panda 0.53);
  fixed in `button.recipe.ts` + `panel.style.ts`.
- `colors.ts` uses 8-digit hex with alpha (`#rrggbbaa`) — fine as token
  values, do not copy them into components.
