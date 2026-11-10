import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function build(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(build()) },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // three.js is most of the weight and changes least often: its own chunk caches across deploys.
    rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react', 'react-dom', '@react-three/fiber'] } } },
  },
});
