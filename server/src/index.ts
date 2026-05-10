import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server as IoServer } from 'socket.io';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { Repo } from './db/repo.js';
import { GameEngine } from './game/engine.js';
import { registerHandlers } from './socket/handlers.js';

async function main() {
  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'info',
      transport:
        config.nodeEnv === 'production'
          ? undefined
          : {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
    },
  });

  const repo = new Repo();
  const engine = new GameEngine(repo);

  // Health check.
  fastify.get('/healthz', async () => ({ ok: true, game_number: repo.getGameStateRow().game_number }));

  // Server static client build in production.
  if (config.nodeEnv === 'production') {
    if (!fs.existsSync(config.clientDist)) {
      fastify.log.warn(
        `Client build not found at ${config.clientDist}. Run "npm run build" before starting in production.`
      );
    } else {
      await fastify.register(fastifyStatic, {
        root: config.clientDist,
        prefix: '/',
        wildcard: false,
      });
      // SPA fallback: anything that's not a file or /socket.io/* falls back to index.html.
      fastify.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith('/socket.io') || req.url.startsWith('/healthz')) {
          reply.status(404).send({ error: 'Not Found' });
          return;
        }
        const indexPath = path.join(config.clientDist, 'index.html');
        reply.type('text/html').send(fs.readFileSync(indexPath));
      });
    }
  }

  await fastify.listen({ port: config.port, host: config.host });

  const io = new IoServer(fastify.server, {
    cors: {
      // In development the Vite dev server runs on a different origin; allow all.
      origin: config.nodeEnv === 'production' ? false : true,
      credentials: true,
    },
  });

  registerHandlers(io, repo, engine);

  fastify.log.info(`Monopoly Banker listening on http://${config.host}:${config.port}`);
  fastify.log.info(
    config.adminCode === '1413'
      ? 'Admin code: using default (set ADMIN_CODE env var to override)'
      : 'Admin code: configured via ADMIN_CODE env var',
  );

  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down…`);
    try {
      io.close();
      await fastify.close();
      repo.close();
      process.exit(0);
    } catch (e) {
      fastify.log.error(e);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
