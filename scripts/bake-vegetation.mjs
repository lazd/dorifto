#!/usr/bin/env node
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';

const species = new Set(['pine', 'oak', 'aspen', 'bushPine', 'bushAsh', 'bushAspen']);
const times = ['noon', 'sunset', 'night'];
const pending = new Set([...species].flatMap((name) => times.map((time) => `${name}/${time}`)));
const server = await createServer({
  cacheDir: 'node_modules/.vite-vegetation-bake',
  server: { port: 8790, strictPort: true },
  plugins: [
    {
      name: 'bake-vegetation',
      configureServer(vite) {
        vite.middlewares.use('/bake', async (request, response) => {
          try {
            if (request.method === 'POST') {
              const name = new URL(request.url, 'http://localhost').searchParams.get('species');
              const time = new URL(request.url, 'http://localhost').searchParams.get('time');
              if (!species.has(name) || !times.includes(time)) throw new Error('Invalid bake');
              const chunks = [];
              for await (const chunk of request) chunks.push(chunk);
              await writeFile(
                new URL(
                  `../src/vegetation-assets/${name}-atlas${time === 'noon' ? '' : `-${time}`}.webp`,
                  import.meta.url,
                ),
                Buffer.concat(chunks),
              );
              response.end('ok');
              pending.delete(`${name}/${time}`);
              if (!pending.size) {
                console.log('All 18 vegetation atlases baked.');
                setTimeout(() => {
                  void vite.close();
                }, 500);
              }
              return;
            }
            response.setHeader('content-type', 'text/html');
            response.end(`<html><body><p id="status">Baking tree atlases...</p><script type="module">
import { THREE, detailedPlants } from '/src/vegetation-models.ts';
import { daylight } from '/src/lighting.ts';
try {
  const loading = new Promise((resolve, reject) => {
    THREE.DefaultLoadingManager.onLoad = resolve;
    THREE.DefaultLoadingManager.onError = (url) => reject(new Error('Texture failed: ' + url));
  });
  const plants = detailedPlants();
  await loading;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(512, 256);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setScissorTest(true);
  document.body.append(renderer.domElement);
  for (const [species, parts] of Object.entries(plants)) {
    const scene = new THREE.Scene();
    const tree = new THREE.Group();
    for (const part of parts) tree.add(new THREE.Mesh(part.geometry, part.material));
    scene.add(tree);
    const ambient = new THREE.HemisphereLight();
    scene.add(ambient);
    const sun = new THREE.DirectionalLight();
    scene.add(sun);
    const box = new THREE.Box3().setFromObject(tree);
    const height = box.max.y;
    const width = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) * 2;
    const extent = Math.max(height, width) * 1.05;
    const camera = new THREE.OrthographicCamera(-extent/2, extent/2, extent/2, -extent/2, 0.1, 200);
    for (const [time, preset] of Object.entries(daylight)) {
      ambient.color.set(preset.ambient);
      ambient.groundColor.set(preset.ground);
      ambient.intensity = preset.ambientIntensity;
      sun.color.set(preset.sun);
      sun.intensity = preset.sunIntensity;
      sun.position.fromArray(preset.sunOffset);
      renderer.toneMappingExposure = preset.exposure;
      for (let view = 0; view < 2; view++) {
      camera.position.set(view ? 50 : 0, height / 2, view ? 0 : 50);
      camera.lookAt(0, height/2, 0);
      renderer.setViewport(view * 256, 0, 256, 256);
      renderer.setScissor(view * 256, 0, 256, 256);
      renderer.render(scene, camera);
    }
    const blob = await new Promise(resolve => renderer.domElement.toBlob(resolve, 'image/webp', 0.9));
    const response = await fetch('/bake?species=' + species + '&time=' + time, { method: 'POST', body: blob });
    if (!response.ok) throw new Error(await response.text());
    }
  }
  document.querySelector('#status').textContent = 'Baked all six species for noon, sunset and night.';
} catch (error) { document.querySelector('#status').textContent = error.stack; console.error(error); }
</script></body></html>`);
          } catch (error) {
            console.error(error);
            response.statusCode = 500;
            response.end(String(error));
          }
        });
      },
    },
  ],
});
await server.listen();
console.log(
  'Open http://localhost:8790/bake to bake distance-tree atlases. The server stops when done.',
);
