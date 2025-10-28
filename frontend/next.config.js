/** @type {import('next').NextConfig} */
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
