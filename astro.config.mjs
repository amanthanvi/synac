/* @ts-check */
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import VitePWA from '@vite-pwa/astro';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare(),
  vite: {
    define: { __BUILD_TIME__: JSON.stringify(Date.now()) },
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
      },
    }),
  ],
});
