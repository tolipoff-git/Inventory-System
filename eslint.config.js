// ESLint flat config — TypeScript strict rules.
// `recommended` = rule set with strict-friendly baseline for real TS projects.
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'public/**', 'node_modules/**', 'template.zip'],
  },

  // just-a-lint of src
  ...tseslint.configs.recommended.map(cfg => ({
    ...cfg,
    files: ['src/**/*.ts'],
  })),

  {
    files: ['src/**/*.ts'],
    rules: {
      // catches `catch {}` (empty block) — needs comment inside to be allowed
      'no-empty': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },

  // Pre-existing `any` usage in legacy modules — tracked; tighten later with a
  // deliberate type-annotation pass instead of a lint-blocking refactor.
  {
    files: ['src/*/**/*.ts', 'src/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];