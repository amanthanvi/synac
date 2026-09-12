import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../..');

const nextConfig: NextConfig = {
  // @synac/shared ships TypeScript source; Next compiles it with the app.
  transpilePackages: ['@synac/shared'],
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
