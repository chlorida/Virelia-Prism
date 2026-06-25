import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Windows: avoid EBUSY when Rust rebuild locks DLLs under src-tauri/target. */
const devWatchIgnored = [
  '**/src-tauri/target/**',
  '**/src-tauri/target/**/*',
  '**/target/**'
];

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
          if (id.includes('@tauri-apps')) return 'vendor-tauri';
          if (id.includes('@fontsource')) return 'vendor-fonts';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: devWatchIgnored
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**', 'dist/**', 'src-tauri/target/**']
  }
});
