import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The front end lives in web/ and builds into app/dist/web, which the server serves.
// `npm run dev:web` proxies API calls to the local server on :4747.
const api = { target: 'http://127.0.0.1:4747', changeOrigin: false };
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../app/dist/web', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': api, '/p': api, '/apps': api, '/setup-tablet': api, '/home-certificate.crt': api, '/home-certificate.mobileconfig': api } },
});
