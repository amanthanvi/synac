import baseConfig from '../../eslint.config.mjs';

export default [
  {
    ignores: ['test-results/**', 'playwright-report/**'],
  },
  ...baseConfig,
];
