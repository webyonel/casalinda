// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  // Repo: webyonel/casalinda → URL: https://webyonel.github.io/casalinda/
  // En local con `astro dev` se ignora el base, así que /admin funciona igual.
  base: process.env.BASE_PATH || '/casalinda/',
});
