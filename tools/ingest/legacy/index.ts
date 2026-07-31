import { logger } from './logger.js';

logger.info('worker.decommissioned', {
  backend: 'convex',
  message: 'Legacy worker startup has been replaced by Convex cron jobs and scheduled functions.',
});
