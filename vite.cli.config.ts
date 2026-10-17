import { defineConfig } from 'vite';

// One Node bundle for the g2x CLI. jzz stays outside: scripts/g2x installs it next to the bundle on Windows.
export default defineConfig({
  build: {
    ssr: 'cli/g2x.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { external: ['jzz'], output: { entryFileNames: 'g2x.mjs', format: 'es' } },
  },
  ssr: { noExternal: true, external: ['jzz'] },
});
