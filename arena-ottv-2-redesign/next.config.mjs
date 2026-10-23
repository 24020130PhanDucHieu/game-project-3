/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    agentUpgrade: 'security',
  },
  output: process.env.ARENA_STATIC_EXPORT === '1' ? 'export' : undefined,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  ...(process.env.ARENA_STATIC_EXPORT === '1' ? {} : { async rewrites() {
    const target = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'
    return [
      {
        source: '/api/:path*',
        destination: `${target}/api/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `${target}/ws/:path*`,
      },
    ]
  }}),
}

export default nextConfig
