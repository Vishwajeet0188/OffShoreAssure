import { config } from './config.js';
import { createApp } from './app.js';
import { migrate } from './migrate.js';

await migrate({ log: true });
createApp().listen(config.port, () => {
  console.log(`OffshoreAssure API on http://localhost:${config.port}/api`);
  if (!config.smtp.host) console.log('SMTP not configured: verification codes are printed here as [DEV EMAIL].');
});
