import http from 'node:http';
import { getEnv } from './config/env.js';
import { getSequelize } from './config/database.js';
import { logger } from './config/logger.js';
import { defineModels } from './db/models/index.js';
import { createApp } from './app.js';
import { attachSocketServer } from './sockets/index.js';

async function bootstrap() {
  const env = getEnv();
  const sequelize = getSequelize();

  await sequelize.authenticate();
  defineModels(sequelize);

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = attachSocketServer(httpServer);
  app.set('io', io);

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'TableFlow server listening');
  });

  const shutdown = async () => {
    logger.info('Shutting down TableFlow server...');
    io.close();
    httpServer.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start TableFlow server');
  process.exit(1);
});
