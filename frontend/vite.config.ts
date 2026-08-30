import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cpSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

function stripLocalRenderRuntime(): Plugin {
  let outputDirectory = '';
  let publicDirectory = '';
  let productionBuild = false;
  return {
    name: 'eclipse-strip-local-render-runtime',
    config(_config, environment) {
      productionBuild = environment.command === 'build';
      return productionBuild ? { publicDir: false } : undefined;
    },
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
      publicDirectory = resolve(config.root, 'public');
    },
    closeBundle() {
      if (!productionBuild) return;
      const excluded = [
        ['studio', 'eclipse-release', 'node_modules'].join(sep),
        ['studio', 'eclipse-release', 'queue'].join(sep),
      ];
      cpSync(publicDirectory, outputDirectory, {
        recursive: true,
        filter(source) {
          const localPath = relative(publicDirectory, source);
          return !excluded.some((entry) => localPath === entry || localPath.startsWith(`${entry}${sep}`));
        },
      });
    },
  };
}

export default defineConfig({
  clearScreen: false,
  plugins: [react(), tailwindcss(), stripLocalRenderRuntime()],
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
