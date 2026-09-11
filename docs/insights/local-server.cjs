// Local acceptance helper: runs the real API without background schedulers.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://civicos:civicos@127.0.0.1:55443/civicos?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'insights-local-acceptance-access-secret-2026';
process.env.JWT_REFRESH_SECRET ??= 'insights-local-acceptance-refresh-secret-2026';
process.env.CORS_ORIGINS = 'http://localhost:4177';
process.env.INSIGHTS_BENCHMARK_PATH = require('node:path').resolve(__dirname, '../../apps/api/artifacts/insights-benchmark.json');
const { createApp } = require('../../apps/api/dist/src/app');
createApp().listen(4407, '127.0.0.1', () => console.log('Insights acceptance API: http://localhost:4407'));
