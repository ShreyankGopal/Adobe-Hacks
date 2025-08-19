import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost', // ✅ allows external access
    port: 5173,
    open: true,
    allowedHosts: ['localhost'], // ✅ add your ngrok host here
  },
});
