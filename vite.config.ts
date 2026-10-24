import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Keep the supplied glTF, its relative textures, binary, and license together.
  publicDir: 'models',
  // Ammo is imported by the physics worker, outside the initial page dependency scan.
  optimizeDeps: { include: ['ammojs-typed'] },
});
