import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js dev badge in the corner of the editor
  devIndicators: false,
  // Sketches are data, not app code: without this, every autosave made the dev
  // server recompile and refresh the editor page
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.git/**', '**/sketches/**'],
      };
    }
    return config;
  },
};

export default nextConfig;
