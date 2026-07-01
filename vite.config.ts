import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { powerApps } from '@microsoft/power-apps-vite/plugin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let appDisplayName = 'Power Platform Control Hub';
try {
  const powerConfig = JSON.parse(
    readFileSync(resolve(__dirname, 'power.config.json'), 'utf-8'),
  ) as { appDisplayName?: string };
  if (powerConfig.appDisplayName) appDisplayName = powerConfig.appDisplayName;
} catch {
  // power.config.json is gitignored (contains connection IDs); fall back to default name.
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), powerApps()],
  define: {
    __APP_DISPLAY_NAME__: JSON.stringify(appDisplayName),
  },
  build: {
    // Fluent UI is large but rarely changes; isolating it into its own vendor chunk
    // keeps it long-cached so returning users only re-download the small app chunk.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@fluentui') || id.includes('@griffel')) return 'fluent-vendor';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      // Allow importing the internal Power Apps SDK runtime context to get cross-env Dataverse access.
      // The path is not in the package's exports map so we map it to the physical file directly.
      '@microsoft/power-apps/dist/internal/data/core/runtime/getRuntimeContext':
        resolve(__dirname, 'node_modules/@microsoft/power-apps/dist/internal/data/core/runtime/getRuntimeContext.js'),
    },
  },
});
