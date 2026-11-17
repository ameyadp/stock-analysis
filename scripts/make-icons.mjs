// Generate the PNG app icons from public/icon.svg.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url));
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname;
const render = (size) => sharp(svg, { density: 512 }).resize(size, size);

await render(192).png().toFile(out('icon-192.png'));
await render(512).png().toFile(out('icon-512.png'));
await render(180).png().toFile(out('apple-touch-icon.png'));

// Maskable icons need a safe zone: shrink the artwork onto a full-bleed background.
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2b4acb' } })
	.composite([{ input: await render(400).png().toBuffer(), gravity: 'center' }])
	.png()
	.toFile(out('icon-512-maskable.png'));

console.log('Icons written to public/');
