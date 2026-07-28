import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    outDir: 'dist',
    // The repo is private but the deploy is public. A source map would publish
    // every .ts file verbatim, so it stays off. Flip to true if you would rather
    // have readable stack traces than keep the source closed.
    sourcemap: false,
  },
});
