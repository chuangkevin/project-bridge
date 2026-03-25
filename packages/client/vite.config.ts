import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5191,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: ['111c748', '111C748'],
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        timeout: 0,        // disable proxy timeout for long-running AI generation
        proxyTimeout: 0,   // disable upstream timeout
      },
    },
  },
});
