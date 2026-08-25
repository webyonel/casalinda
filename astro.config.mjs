// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  // `base` se ajusta al nombre del repo en el deploy a GitHub Pages.
  // En local deja '/' para que /admin funcione sin prefijo.
  base: '/',
});
