import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Keep the supplied glTF, its relative textures, binary, and license together.
  publicDir: 'models',
});
