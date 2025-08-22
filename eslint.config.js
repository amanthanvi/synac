import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';

export default [
  // Ignore build artifacts and deps
  { ignores: ['dist/**', 'node_modules/**'] },

  // Astro recommended (sets astro parser for .astro)
  ...astro.configs['flat/recommended'],

  // TypeScript/JS files
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Keep minimal; rely on TS strict + Prettier for formatting
    },
  },

  // Disable rules that conflict with Prettier formatting
  prettier,
];
