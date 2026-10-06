// Draws the Build With Me icon (talk + build: a speech bubble holding a tiny app) and writes
// app/assets/icon.png (512 px) and app/assets/icon.ico (16–256 px, PNG-in-ICO).
// Run once after changing the drawing: node scripts/make-icon.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3fb37f"/><stop offset="1" stop-color="#3a8ee2"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bg)"/>
  <!-- speech bubble -->
  <path d="M120 112h272a48 48 0 0 1 48 48v168a48 48 0 0 1-48 48H232l-72 64v-64h-40a48 48 0 0 1-48-48V160a48 48 0 0 1 48-48z" fill="#fff"/>
  <!-- a tiny app being built: header bar + blocks -->
  <rect x="136" y="160" width="240" height="36" rx="12" fill="#3a8ee2"/>
  <rect x="136" y="212" width="112" height="112" rx="18" fill="#f6b73c"/>
  <rect x="264" y="212" width="112" height="48" rx="14" fill="#3fb37f"/>
  <rect x="264" y="276" width="112" height="48" rx="14" fill="#e2733a"/>
  <!-- sparkle -->
  <path d="M424 56l14 34 34 14-34 14-14 34-14-34-34-14 34-14z" fill="#fff6c9"/>
</svg>`;

mkdirSync('app/assets', { recursive: true });
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('app/assets/icon.png');

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((s) => sharp(Buffer.from(svg), { density: 300 }).resize(s, s).png().toBuffer()));
// ICO: 6-byte header, 16-byte directory entry per image, then the PNG data.
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0); e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
writeFileSync('app/assets/icon.ico', Buffer.concat([header, ...dir, ...pngs]));
console.log('wrote app/assets/icon.png and app/assets/icon.ico');
