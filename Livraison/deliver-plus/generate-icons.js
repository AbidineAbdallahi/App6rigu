const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const SIZE = 1024;

// ── Design : "A" géométrique + "mnir" intégré en signature moderne ────────────
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="110%" y2="110%">
      <stop offset="0%"   stop-color="#2C2570"/>
      <stop offset="60%"  stop-color="#3B328F"/>
      <stop offset="100%" stop-color="#534AB7"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#F0C84A"/>
      <stop offset="100%" stop-color="#C49A3C"/>
    </linearGradient>
    <linearGradient id="goldBar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#F0C84A"/>
      <stop offset="100%" stop-color="#E8A830"/>
    </linearGradient>
  </defs>

  <!-- Fond violet profond -->
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>

  <!-- Cercles décoratifs subtils -->
  <circle cx="900" cy="130"  r="340" fill="rgba(255,255,255,0.04)"/>
  <circle cx="100" cy="920"  r="280" fill="rgba(255,255,255,0.03)"/>
  <circle cx="512" cy="512"  r="480" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1.5"/>

  <!-- ═══ Lettre A géométrique dorée ═══ -->
  <!-- Jambe gauche -->
  <polygon points="512,118  252,690  352,690  512,368" fill="url(#gold)"/>
  <!-- Jambe droite -->
  <polygon points="512,118  772,690  672,690  512,368" fill="url(#gold)"/>
  <!-- Barre horizontale blanche -->
  <rect x="346" y="510" width="332" height="72" rx="10" fill="white"/>

  <!-- ═══ "mnir" en signature — à droite du pied du A ═══ -->
  <!-- Trait séparateur vertical fin -->
  <rect x="430" y="720" width="3" height="90" rx="2" fill="rgba(255,255,255,0.3)"/>

  <!-- Texte "mnir" en blanc, léger, moderne -->
  <text x="456" y="800"
        font-family="Arial, Helvetica, sans-serif"
        font-size="108"
        font-weight="300"
        fill="white"
        text-anchor="start"
        letter-spacing="6"
        opacity="0.92">mnir</text>

  <!-- Petite ligne dorée sous "mnir" — soulignement signature -->
  <rect x="456" y="818" width="288" height="5" rx="3" fill="url(#goldBar)" opacity="0.85"/>

  <!-- Point doré décoratif (point sur le i) style moderne -->
  <circle cx="700" cy="720" r="8" fill="url(#gold)" opacity="0.9"/>
</svg>`;

// ── Adaptive icon : même design sans éléments aux bords ──────────────────────
const adaptiveSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg2" x1="0%" y1="0%" x2="110%" y2="110%">
      <stop offset="0%"   stop-color="#2C2570"/>
      <stop offset="60%"  stop-color="#3B328F"/>
      <stop offset="100%" stop-color="#534AB7"/>
    </linearGradient>
    <linearGradient id="gold2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#F0C84A"/>
      <stop offset="100%" stop-color="#C49A3C"/>
    </linearGradient>
    <linearGradient id="goldBar2" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#F0C84A"/>
      <stop offset="100%" stop-color="#E8A830"/>
    </linearGradient>
  </defs>

  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg2)"/>
  <circle cx="512" cy="512" r="500" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="2"/>

  <!-- A doré -->
  <polygon points="512,108  244,700  348,700  512,368" fill="url(#gold2)"/>
  <polygon points="512,108  780,700  676,700  512,368" fill="url(#gold2)"/>
  <rect x="342" y="514" width="340" height="74" rx="10" fill="white"/>

  <!-- "mnir" -->
  <rect x="428" y="726" width="3" height="88" rx="2" fill="rgba(255,255,255,0.3)"/>
  <text x="452" y="806"
        font-family="Arial, Helvetica, sans-serif"
        font-size="108"
        font-weight="300"
        fill="white"
        text-anchor="start"
        letter-spacing="6"
        opacity="0.92">mnir</text>
  <rect x="452" y="822" width="288" height="5" rx="3" fill="url(#goldBar2)" opacity="0.85"/>
  <circle cx="698" cy="726" r="8" fill="url(#gold2)" opacity="0.9"/>
</svg>`;

async function generate(svgStr, outPath) {
  const buf = Buffer.from(svgStr);
  await sharp(buf, { density: 150 })
    .resize(SIZE, SIZE)
    .png({ quality: 100, compressionLevel: 6 })
    .toFile(outPath);
  console.log('✅', outPath);
}

async function main() {
  const targets = [
    { svg: iconSvg,     out: 'mobile/assets/icon.png' },
    { svg: adaptiveSvg, out: 'mobile/assets/adaptive-icon.png' },
    { svg: iconSvg,     out: 'mobile-client/assets/icon.png' },
    { svg: adaptiveSvg, out: 'mobile-client/assets/adaptive-icon.png' },
  ];

  for (const { svg, out } of targets) {
    const full = path.join(__dirname, out);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    await generate(svg, full);
  }

  console.log('\n🎉 Icônes Amnir générées !');
}

main().catch(e => { console.error('Erreur:', e.message); process.exit(1); });
