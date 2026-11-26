import type { NextConfig } from "next";

// A app é toda ela no navegador (IndexedDB), por isso o build gera um site
// estático (pasta out/) que corre na Vercel, no GitHub Pages ou em qualquer
// outro sítio. Se precisar de caminho base (ex.: /LuzIA), usa a variável
// NEXT_PUBLIC_BASE_PATH.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath,
  images: { unoptimized: true },
  // desliga o botão flutuante do Next em modo de desenvolvimento
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
