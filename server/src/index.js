import { config } from './config.js';
import { createApp } from './app.js';
import { migrate } from './migrate.js';

await migrate({ log: true });
createApp().listen(config.port, () => {
  console.log(`OffshoreAssure API on http://localhost:${config.port}/api`);
  if (config.brevoApiKey) console.log('Email: sending through the Brevo web API.');
  else if (config.smtp.host) console.log(`Email: sending through SMTP (${config.smtp.host}:${config.smtp.port}).`);
  else console.log('Email not configured: verification codes are printed here as [DEV EMAIL].');
});
