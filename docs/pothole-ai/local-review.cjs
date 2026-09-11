// Local acceptance server only. Real API/database, filesystem-backed evidence uploads.
// No schedulers, reset, remote services, or production credentials.
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('../../apps/api/node_modules/express');
const root = path.resolve(__dirname, '../..');
const dir = path.join(root, '.scan-review.tmp');
fs.mkdirSync(dir, { recursive: true });
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://civicos:civicos@127.0.0.1:55443/civicos?schema=public';
if (!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Local acceptance database required');
process.env.JWT_ACCESS_SECRET ??= 'local-scan-acceptance-access-token-not-production';
process.env.JWT_REFRESH_SECRET ??= 'local-scan-acceptance-refresh-token-not-production';
process.env.POTHOLE_SCAN_PROVIDER = 'demo';
process.env.PUBLIC_API_URL = 'http://localhost:4407';
process.env.CORS_ORIGINS = 'http://localhost:4177,http://localhost:4178';
const hash = key => createHash('sha256').update(key).digest('hex');
const pending = new Map();
const files = express();
files.use((req,res,next) => { res.header('Access-Control-Allow-Origin', 'http://localhost:4177'); res.header('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS'); res.header('Access-Control-Allow-Headers', 'Content-Type'); if(req.method==='OPTIONS') return res.sendStatus(204); next(); });
files.put('/upload/:token', express.raw({ type: '*/*', limit: '10mb' }), (req,res) => {
  const item = pending.get(req.params.token);
  if(!item || !Buffer.isBuffer(req.body) || req.body.length < 100) return res.sendStatus(400);
  fs.writeFileSync(path.join(dir, item.hash), req.body);
  fs.writeFileSync(path.join(dir, item.hash+'.json'), JSON.stringify({ contentType:item.contentType }));
  pending.delete(req.params.token); res.sendStatus(200);
});
files.get('/files/:hash', (req,res) => {
  if(!/^[a-f0-9]{64}$/.test(req.params.hash)) return res.sendStatus(404);
  try { const metadata=JSON.parse(fs.readFileSync(path.join(dir, req.params.hash+'.json'),'utf8')); res.type(metadata.contentType).sendFile(path.join(dir, req.params.hash)); } catch { res.sendStatus(404); }
});
const storage = {
  createUpload(key, contentType) { const token=randomUUID(), digest=hash(key); pending.set(token,{hash:digest,contentType}); return { uploadUrl:`http://localhost:4408/upload/${token}`, publicUrl:`http://localhost:4408/files/${digest}`, headers:{'Content-Type':contentType}, expiresInSeconds:900 }; },
  createDownload(key) { return `http://localhost:4408/files/${hash(key)}`; },
  async verifyUpload(key, contentType) { try { const bytes=fs.readFileSync(path.join(dir,hash(key))); const metadata=JSON.parse(fs.readFileSync(path.join(dir,hash(key)+'.json'),'utf8')); return bytes.length > 100 && bytes.length <= 10485760 && metadata.contentType===contentType && (contentType==='image/jpeg' ? bytes[0]===255 && bytes[1]===216 : contentType==='image/png' && bytes[0]===137); } catch { return false; } },
};
files.listen(4408,'127.0.0.1');
const { createApp } = require('../../apps/api/dist/src/app');
createApp({ imageStorage:storage }).listen(4407,'127.0.0.1',()=>console.log('Road scan acceptance API http://localhost:4407; evidence uploads http://localhost:4408'));
