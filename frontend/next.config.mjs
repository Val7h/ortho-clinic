/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  // ── Compression ──────────────────────────────────────────────────────────
  compress: true,

  // ── Image optimisation ──────────────────────────────────────────────────
  images: {
    remotePatterns: [
      { protocol: "http",  hostname: "localhost" },
      { protocol: "https", hostname: "ortho-clinic-ldcd.onrender.com" },
    ],
    // Prefer AVIF → WebP → original. Browser picks best supported format.
    formats: ["image/avif", "image/webp"],
    // Serve device-appropriate resolutions for patient photos
    deviceSizes: [320, 420, 640, 750, 828, 1080, 1200],
    imageSizes: [48, 64, 96, 128, 192],
    // Aggressive caching — medical app images rarely change
    minimumCacheTTL: 3600,
    // Keep svg unoptimized (logo etc)
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // ── Bundle analysis flag ─────────────────────────────────────────────────
  // Run: ANALYZE=true npm run build
  ...(process.env.ANALYZE === "true" && {
    experimental: {
      bundlePagesRouterDependencies: true,
    },
  }),

  // ── Compiler ─────────────────────────────────────────────────────────────
  compiler: {
    // Remove console.* calls in production (except console.error)
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error"] }
        : false,
  },

  // ── Experimental perf flags ──────────────────────────────────────────────
  experimental: {
    // Partial pre-rendering: static shell + streaming dynamic parts
    ppr: false, // enable when Next 15 stable
    // Faster module resolution
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@nextui-org/react",
      "date-fns",
    ],
  },

  // ── Webpack tweaks ────────────────────────────────────────────────────────
  webpack(config, { isServer }) {
    if (!isServer) {
      // Replace heavyweight moment with date-fns (already using it)
      config.resolve.alias = {
        ...config.resolve.alias,
        moment: false,
      };

      // Split recharts into its own async chunk — only loaded on dashboard
      config.optimization.splitChunks = {
        ...(config.optimization.splitChunks || {}),
        cacheGroups: {
          ...(config.optimization.splitChunks?.cacheGroups || {}),
          recharts: {
            test: /[\\/]node_modules[\\/](recharts|d3-)[\\/]/,
            name: "recharts",
            chunks: "async",
            priority: 20,
          },
          nextui: {
            test: /[\\/]node_modules[\\/]@nextui-org[\\/]/,
            name: "nextui",
            chunks: "async",
            priority: 15,
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;
