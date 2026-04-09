import { defineConfig } from 'vite';

export default defineConfig({
  // Entry is index.html at the project root (Vite default)
  // Output goes to dist/ when you run npm run build
  build: {
    outDir: 'dist',
  },
});
