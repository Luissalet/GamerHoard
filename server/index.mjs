#!/usr/bin/env node
// Local GamerHoard web app: serves apps/mobile/dist and the REST API over the shared library.
//   npm run server            (GAMERHOARD_PORT=5207, GAMERHOARD_DATA_DIR, GAMERHOARD_DATA_FILE, RAWG_API_KEY)
import { createApp, resolveConfig } from './app.mjs';
import { runServer } from './hoard-commons/express.js';

const config = resolveConfig();
try {
  const { port } = await runServer({
    service: 'GamerHoard',
    port: config.port,
    createApp: () => createApp({ ...config, port: config.port }).app,
  });
  console.log(`GamerHoard: http://127.0.0.1:${port}`);
  console.log(`Library: ${config.libraryPath}`);
  console.log(process.env.RAWG_API_KEY || process.env.EXPO_PUBLIC_RAWG_KEY ? 'RAWG catalogue: on' : 'RAWG catalogue: off (set RAWG_API_KEY)');
} catch (error) {
  console.error(error?.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set GAMERHOARD_PORT.` : error);
  process.exitCode = 1;
}
