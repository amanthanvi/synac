/* @ts-check */
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import VitePWA from '@vite-pwa/astro';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://synac.app',
  vite: {
    define: { __BUILD_TIME__: JSON.stringify(Number(process.env.SOURCE_DATE_EPOCH || Date.now())) },
  },
  build: {
    inlineStylesheets: 'never',
  },
  integrations: [
    mdx(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      includeAssets: ['/favicon.svg'],
      devOptions: { enabled: true },
      manifest: {
        name: 'SynAc',
        short_name: 'SynAc',
        start_url: '/',
        display: 'standalone',
        theme_color: '#0b0e14',
        background_color: '#0b0e14',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json,txt,woff2,webp}'],
        ignoreURLParametersMatching: [/^v$/],
        runtimeCaching: [
          {
            urlPattern: /\/search\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'search-json-v1',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
