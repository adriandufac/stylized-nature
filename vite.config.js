import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  root: 'src',            // index.html and source live here
  publicDir: '../static', // raw assets served as-is from the root URL
  base: './',
  server: {
    host: true,           // expose on the local network
    open: true,           // open the browser on `npm run dev`
  },
  build: {
    outDir: '../dist',    // output relative to project root, not src/
    emptyOutDir: true,
    sourcemap: true,
  },
  plugins: [glsl()],
})
