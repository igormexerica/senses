import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Serviço systemd roda `node .next/standalone/server.js` (deploy enxuto no Contabo).
  output: "standalone",
  // O monorepo /root/senses tem outros lockfiles; fixa a raiz neste app pro
  // Turbopack não inferir o diretório errado.
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default nextConfig;
