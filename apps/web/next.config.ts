import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@paymind/core', '@paymind/db', '@paymind/ui-tokens'],
  // Workspace packages use explicit `.ts` extensions in relative imports.
  turbopack: {},
};

export default nextConfig;
