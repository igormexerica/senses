import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Há outro package-lock em /root/senses; fixa a raiz neste app pra
  // o Turbopack não inferir o diretório errado.
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default nextConfig;
