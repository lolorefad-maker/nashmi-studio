import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { seed, MEDIA_DIR } from './db.js';
import { aiStatus } from './ai.js';
import { startScheduler } from './scheduler.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import teamRoutes from './routes/team.js';
import integrationRoutes from './routes/integrations.js';
import socialRoutes from './routes/social.js';
import reportRoutes from './routes/reports.js';
import assistantRoutes from './routes/assistant.js';
import systemRoutes from './routes/systems.js';
import clientRoutes from './routes/client.js';

seed();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/workspace', teamRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/biz', systemRoutes);
app.use('/api', clientRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Post images must be publicly reachable for Instagram/Facebook to fetch them; tokens are unguessable.
app.get('/media/:file', (req, res) => {
  const m = /^([\w-]{20,40})\.jpg$/.exec(req.params.file);
  const file = m && path.join(MEDIA_DIR, `${m[1]}.jpg`);
  if (!file || !existsSync(file)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(file);
});

// Frontend vendor libraries served straight from node_modules.
const nm = (p) => path.resolve('node_modules', p);
app.get('/vendor/fabric.js', (req, res) => res.sendFile(nm('fabric/dist/fabric.min.js')));
app.get('/vendor/chart.js', (req, res) => res.sendFile(nm('chart.js/dist/chart.umd.js')));
app.get('/vendor/lucide.js', (req, res) => res.sendFile(nm('lucide/dist/umd/lucide.min.js')));
app.get('/vendor/marked.js', (req, res) => res.sendFile(nm('marked/lib/marked.umd.js')));
app.get('/vendor/purify.js', (req, res) => res.sendFile(nm('dompurify/dist/purify.min.js')));

app.use(express.static(path.resolve('public'), { extensions: ['html'] }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  const ai = aiStatus();
  console.log(`\n  ${process.env.APP_NAME || 'Nashmi Studio'} → http://localhost:${PORT}`);
  console.log(`  AI model: ${ai.connected ? `connected (${ai.model})` : 'demo mode — set AI_BASE_URL in .env to connect'}\n`);
  startScheduler();
});
