import type { NextConfig } from "next";

// A app agora tem uma verdade partilhada: os dados vivem no Vercel Blob
// (via rotas /api) e sincronizam para todos os aparelhos. O IndexedDB
// continua a ser a cópia local rápida — a app funciona offline e sincroniza
// quando a internet volta. O caminho base (ex.: /LuzIA no GitHub Pages)
// continua a funcionar se NEXT_PUBLIC_BASE_PATH estiver definido.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
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
