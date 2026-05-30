import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { powerApps } from '@microsoft/power-apps-vite/plugin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const powerConfig = JSON.parse(
  readFileSync(resolve(__dirname, 'power.config.json'), 'utf-8'),
) as { appDisplayName: string };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), powerApps()],
  define: {
    __APP_DISPLAY_NAME__: JSON.stringify(powerConfig.appDisplayName),
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
