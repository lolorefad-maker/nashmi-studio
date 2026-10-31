// Background jobs: publish due posts every minute, monthly reports, nightly store sync.
import { publishDuePosts } from './routes/social.js';
import { sendMonthlyReports } from './routes/reports.js';
import { syncAllStores } from './routes/integrations.js';
import { runDueWorkflows } from './systems.js';

let running = false;
let lastStoreSync = '';

async function tick() {
  if (running) return;
  running = true;
  try {
    await publishDuePosts();
    await runDueWorkflows();
    await sendMonthlyReports();
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getHours() === 3 && lastStoreSync !== day) {
      lastStoreSync = day;
      await syncAllStores();
    }
  } catch (err) {
    console.error('[scheduler]', err);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  setTimeout(tick, 5_000);
  setInterval(tick, 60_000).unref();
}
