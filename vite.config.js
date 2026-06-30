import { defineConfig } from 'vite';

export default defineConfig({
  base: '/storyworlds/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
