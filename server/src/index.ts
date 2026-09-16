import { createApp } from './app.ts';
import { config } from './config.ts';
import { openDb } from './db.ts';
import { startScheduler } from './scheduler.ts';

const db = await openDb();
startScheduler(db);

createApp(db).listen(config.port, () => {
  console.log(`FinLedger API listening on :${config.port}`);
});
