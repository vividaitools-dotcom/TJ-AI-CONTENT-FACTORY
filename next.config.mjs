/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['sql.js', 'sharp'],
  experimental: {
    serverActions: { bodySizeLimit: '48mb' },
  },
};

export default nextConfig;
