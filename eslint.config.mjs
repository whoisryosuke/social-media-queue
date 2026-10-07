import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.astro/**', '**/styled-system/**', 'storage/**'],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {},
  },
  {
    // Placeholder: parses TS so `eslint <dir|file>` lints sources.
    // Real rules arrive with Phase 9 hardening.
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    rules: {},
  },
)
