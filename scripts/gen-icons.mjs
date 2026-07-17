// สร้างไอคอน PWA จากโลโก้ SVG — รัน: node scripts/gen-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const logo = (pad = 0) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${32 + pad * 2} ${32 + pad * 2}">
  <rect x="${-pad}" y="${-pad}" width="${32 + pad * 2}" height="${32 + pad * 2}" fill="#7132f5"/>
  <rect width="32" height="32" rx="7" fill="#7132f5"/>
  <path d="M6 24V14l10-6 10 6v10h-7v-6h-6v6H6z" fill="#fff"/>
</svg>`)

mkdirSync('public', { recursive: true })
await sharp(logo()).resize(192, 192).png().toFile('public/pwa-192.png')
await sharp(logo()).resize(512, 512).png().toFile('public/pwa-512.png')
await sharp(logo(6)).resize(512, 512).png().toFile('public/pwa-maskable-512.png')
await sharp(logo()).resize(180, 180).png().toFile('public/apple-touch-icon.png')
console.log('icons generated')
