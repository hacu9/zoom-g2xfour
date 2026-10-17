import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';

export default defineConfig({
  // alphaTab: serves its worker, audio worklet, music font and sound bank for the Tabs panel.
  plugins: [react(), alphaTab()],
  server: { port: 5173, strictPort: true },
});
