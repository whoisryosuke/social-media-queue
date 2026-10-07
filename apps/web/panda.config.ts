import { defineConfig } from '@pandacss/dev'
import preset from './src/theme/preset'
import COLOR_PALETTE_OPTIONS from './src/theme/tokens/colorPalette'

export default defineConfig({
  presets: [preset],
  // User-provided "daw-preset" (apps/web/src/theme). Use only its tokens/recipes.
  preflight: true,
  include: ['./src/**/*.{ts,tsx,astro}'],
  exclude: [],
  outdir: 'styled-system',

  // Generates JSX utilities with options of React, Preact, Qwik, Solid, Vue
  jsxFramework: 'react',

  // Ensure we get all colors dynamically
  staticCss: {
    css: [
      {
        properties: {
          colorPalette: [...COLOR_PALETTE_OPTIONS],
        },
      },
    ],
  },
})
