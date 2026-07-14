import { createApp, createDependencies } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp(createDependencies(config));

app.listen(config.PORT, '127.0.0.1', () => {
  process.stdout.write(
    `${JSON.stringify({ level: 'info', event: 'server_started', port: config.PORT, appEnv: config.APP_ENV })}\n`,
  );
});
