import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5188,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: ['111c748', '111C748'],
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
