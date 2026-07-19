import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Served by the NestJS backend under /dashboard (see backend app.module.ts),
// so the built assets are based at /dashboard/.
export default defineConfig({
  base: '/dashboard/',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist' },
});
