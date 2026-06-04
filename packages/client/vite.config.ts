import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

function getGitCommit(): string {
  // Docker builds don't have .git — use VITE_APP_VERSION env var set via
  // --build-arg COMMIT_SHA=<sha> in Dockerfile. Falls back to git on local dev.
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_COMMIT__: JSON.stringify(getGitCommit()),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
