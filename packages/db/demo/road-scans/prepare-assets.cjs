// Reproduce the local demo bundle from the already validated, licensed photographs.
// Original JPEGs are copied unchanged. Overlay/replay metadata is illustrative.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const entries = [
  ['01', 'Thomas Booker (CoderThomasB)', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
  ['02', 'Roman Riabenko', 'CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  ['06', 'marius sebastian', 'CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  ['07', 'Mateusz Konieczny', 'CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
];
const assets = entries.map(([number, author, license, licenseUrl]) => {
  const name = `real_sample_${number}`;
  const output = JSON.parse(fs.readFileSync(path.join(root, `services/pothole-ai/validation/real/outputs/${name}.json`), 'utf8'));
  const bytes = fs.readFileSync(path.join(root, `services/pothole-ai/validation/real/images/${name}.jpg`));
  fs.writeFileSync(path.join(__dirname, `${name}.jpg`), bytes);
  return { id: name, file: `${name}.jpg`, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sourceUrl: output.sourceUrl, title: output.title, author, license, licenseUrl, attribution: `${output.title} — ${author}, ${license}. Original photo unchanged; overlay and frame replay illustrative.`, image: output.imageDimensions, detections: output.detections };
});
const cameras = [
  ['single', 'Service road south', '02', '06', 'clear'],
  ['multiple', 'Campus approach', '01', '06', 'clear'],
  ['clear', 'Service road east', '06', '06', 'clear'],
  ['repeated', 'Jakkasandra junction', '02', '02', 'visible'],
  ['poor', 'Junction approach', '07', '07', 'poor'],
  ['patch', 'Service road west', '07', '07', 'clear'],
  ['existing', 'Utility crossing', '02', '02', 'visible'],
  ['repair', 'Campus service lane', '02', '06', 'clear'],
].map(([reference, name, before, after, verification], index) => ({ reference, code: `DEMO-CAM-${String(index + 1).padStart(2, '0')}`, name, before: `real_sample_${before}`, after: `real_sample_${after}`, quality: reference === 'poor' ? 'poor' : 'usable', verification, latitude: 12.637 + index * .0004, longitude: 77.438 + index * .0006 }));
fs.writeFileSync(path.join(__dirname, 'manifest.json'), JSON.stringify({ version: 1, disclaimer: 'Simulated camera network. Photos are from unrelated locations, not Bengaluru CCTV or proof of an actual repair. Three repeated fixture samples simulate separate captures.', assets, cameras }, null, 2) + '\n');
