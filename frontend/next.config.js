/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const nextConfig = {
  reactStrictMode: true,

  // API 代理到后端
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
    return [
      {
        source: "/api/:path*",
        destination: `${api}/:path*`
      }
    ];
  },

  // 全站安全响应头
  async headers() {
    const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    let apiOrigin = '';
    try { apiOrigin = new URL(api).origin; } catch { apiOrigin = api; }

    const cspProd = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      `connect-src 'self' ${apiOrigin}`,
    ].join('; ');

    const cspDev = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      `connect-src 'self' ${apiOrigin} ws:`,
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: isProd ? cspProd : cspDev },
          { key: 'Strict-Transport-Security', value: isProd ? 'max-age=15552000; includeSubDomains' : 'max-age=0' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },

  // 忽略可选依赖的警告
  webpack: (config, { isServer }) => {
    // 忽略这些模块的缺失警告（它们是可选依赖）
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
      'encoding': false,
    };

    // 忽略特定的警告
    config.ignoreWarnings = [
      { module: /node_modules\/@metamask\/sdk/ },
      { module: /node_modules\/pino/ },
    ];

    return config;
  },
};

module.exports = nextConfig;
