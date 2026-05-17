// Generates 9 branded PNG postcards for Snelling Cafe, one per table.
// Output: public/postcards/snelling-cafe-table-{N}.png  (1800×1200px, 6×4" @ 300dpi)
// Run: node scripts/generate-postcards.js

import QRCode    from 'qrcode';
import { Resvg } from '@resvg/resvg-js';
import fs        from 'fs';
import path      from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SLUG    = 'snelling-cafe';
const NAME    = 'SNELLING CAFE';
const BASE    = 'https://qrserve-v3.vercel.app';
const OUT_DIR = path.join(__dirname, '..', 'public', 'postcards');

const W = 1800, H = 1200;

// Brand colours
const DARK   = '#080808';
const GOLD   = '#E8C547';
const LIGHT  = '#F0EDE8';
const MUTED  = '#8a8170';
const WHITE  = '#FFFFFF';
const BLACK  = '#000000';

// ── SVG helpers ──────────────────────────────────────────────────────────────

/** One QR finder-pattern square */
function finder(x, y, s) {
  const b = s * 0.15;  // border width
  const c = s * 0.3;   // center block size
  const r = s * 0.13;  // corner radius
  return `
    <rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${GOLD}" rx="${r}"/>
    <rect x="${x+b}" y="${y+b}" width="${s-2*b}" height="${s-2*b}" fill="${DARK}" rx="${r*0.5}"/>
    <rect x="${x+(s-c)/2}" y="${y+(s-c)/2}" width="${c}" height="${c}" fill="${GOLD}" rx="${r*0.3}"/>`;
}

/** Three-finder QR mark */
function qrMark(x, y, s) {
  const g = s * 0.23;
  return finder(x, y, s)
       + finder(x + s + g, y, s)
       + finder(x, y + s + g, s);
}

/** Build the complete SVG for one table */
async function buildSvg(tableNum) {
  const tableSlug = `table-${tableNum}`;
  const url       = `${BASE}/scan/${SLUG}/${tableSlug}`;

  // Black-on-white QR code (readable at any background)
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 520, margin: 2,
    color: { dark: BLACK, light: WHITE },
  });

  // Layout constants
  const MRK  = 38;    // finder size px
  const MRG  = 80;    // page margin
  const QR_W = 540;   // QR image size
  const QR_X = (W - QR_W) / 2;
  const QR_BG_PAD = 20;

  // Vertical layout
  const logoY  = 72;                       // top of QR mark
  const ruleY  = logoY + MRK*2 + MRK*0.23 + 18; // separator
  const nameY  = ruleY + 88;              // baseline of restaurant name
  const qrBgY  = nameY + 32;             // top of white QR bg
  const qrBgH  = QR_W + QR_BG_PAD*2;
  const ctaY   = qrBgY + qrBgH + 50;    // CTA text baseline
  const pillH  = 96;
  const pillY  = ctaY + 60;              // top of pill
  const powY   = H - 38;                 // powered by baseline

  // Gold pill dimensions
  const pillLabel = `TABLE ${tableNum}`;
  const pillW     = pillLabel.length * 36 + 100; // approx width
  const pillX     = (W - pillW) / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="${DARK}"/>

  <!-- Gold border outer -->
  <rect x="14" y="14" width="${W-28}" height="${H-28}"
        fill="none" stroke="${GOLD}" stroke-width="6" rx="22"/>
  <!-- Gold border inner (subtle) -->
  <rect x="28" y="28" width="${W-56}" height="${H-56}"
        fill="none" stroke="${GOLD}" stroke-width="1.5" rx="14" opacity="0.25"/>

  <!-- ── Logo (top-left) ───────────────────────────────────────────── -->
  ${qrMark(MRG, logoY, MRK)}
  <text x="${MRG + MRK*2 + MRK*0.23 + 16}" y="${logoY + MRK + 7}"
        font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-weight="900" font-size="38" fill="${LIGHT}" letter-spacing="1.5">QR-Wegn</text>

  <!-- Separator rule -->
  <line x1="${MRG}" y1="${ruleY}" x2="${W - MRG}" y2="${ruleY}"
        stroke="${GOLD}" stroke-width="1.5" opacity="0.35"/>

  <!-- ── Restaurant name ───────────────────────────────────────────── -->
  <text x="${W/2}" y="${nameY}"
        font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-weight="900" font-size="80" fill="${GOLD}"
        text-anchor="middle" letter-spacing="14">${NAME}</text>

  <!-- ── QR code (black on white) ─────────────────────────────────── -->
  <!-- White background -->
  <rect x="${QR_X - QR_BG_PAD}" y="${qrBgY}"
        width="${QR_W + QR_BG_PAD*2}" height="${qrBgH}"
        fill="${WHITE}" rx="20"/>
  <!-- QR image -->
  <image href="${qrDataUrl}" xlink:href="${qrDataUrl}"
         x="${QR_X}" y="${qrBgY + QR_BG_PAD}"
         width="${QR_W}" height="${QR_W}"
         image-rendering="crisp-edges"/>

  <!-- ── CTA text ──────────────────────────────────────────────────── -->
  <text x="${W/2}" y="${ctaY}"
        font-family="Arial, Helvetica, sans-serif"
        font-weight="400" font-size="46" fill="${LIGHT}"
        text-anchor="middle" opacity="0.78">Scan to order — No app required</text>

  <!-- ── TABLE pill ────────────────────────────────────────────────── -->
  <rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}"
        fill="${GOLD}" rx="${pillH/2}"/>
  <text x="${W/2}" y="${pillY + pillH*0.68}"
        font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-weight="900" font-size="52" fill="${DARK}"
        text-anchor="middle" letter-spacing="8">${pillLabel}</text>

  <!-- ── Powered by ────────────────────────────────────────────────── -->
  <text x="${W/2}" y="${powY}"
        font-family="Arial, Helvetica, sans-serif"
        font-weight="400" font-size="26" fill="${MUTED}"
        text-anchor="middle" letter-spacing="1">Powered by QR-Wegn</text>

</svg>`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Generating Snelling Cafe table postcards…\n');

  for (let i = 1; i <= 9; i++) {
    const svg  = await buildSvg(i);
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W } });
    const png  = resvg.render().asPng();
    const file = `snelling-cafe-table-${i}.png`;
    fs.writeFileSync(path.join(OUT_DIR, file), png);
    console.log(`  ✓ ${file}  (${(png.length / 1024).toFixed(0)} KB)`);
  }

  console.log('\n✅ All 9 postcards saved to public/postcards/\n');
  console.log('Download links (after deploy):');
  for (let i = 1; i <= 9; i++) {
    console.log(`  https://qrserve-v3.vercel.app/postcards/snelling-cafe-table-${i}.png`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
