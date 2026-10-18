import * as THREE from '../vendor/three.module.js';

function canvasTexture(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 16;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

// Broad variation survives minification; the fine, dark pen strokes of the old
// procedural parquet did not. Seams are a similar tone to the boards themselves.
export function oakFloorTexture(photo) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9b866b';
  ctx.fillRect(0, 0, 2048, 2048);
  const unit = 64;
  const random = (n) => { const v = Math.sin(n * 93.71 + 71.03) * 17321.37; return v - Math.floor(v); };
  // Long European oak boards, 22 cm across, rather than a repeating checkerboard.
  for (let column = 0; column < 32; column++) {
    const offset = Math.floor(random(column + 1) * 6) * unit;
    for (let row = -1; row < 6; row++) {
      const x = column * unit, y = row * 448 + offset;
      const light = 150 + Math.round(random(column * 13 + row * 7) * 9);
      ctx.fillStyle = `rgb(${light + 22},${light + 4},${light - 24})`;
      ctx.fillRect(x, y, unit, 448);
      if (photo) {
        // The photographed fibres are vertical, as are the boards in this atlas.
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = .30;
        ctx.drawImage(photo, (column * 31) % 300, (row * 37 + 512) % 100, 160, 410, x, y, unit, 448);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.fillStyle = 'rgba(82,61,40,.035)';
        for (let grain = 0; grain < 4; grain++) {
          ctx.fillRect(x + 8 + random(column * 47 + grain * 3) * 48, y, 2 + grain, 448);
        }
      }
      ctx.fillStyle = 'rgba(66,49,34,.15)';
      ctx.fillRect(x, y, .65, 448);
      ctx.fillRect(x, y, unit, .65);
    }
  }
  return canvasTexture(canvas, 46 / 7.04, 56 / 7.04);
}

export function quietWoodTexture(photo) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(photo, 0, 0, 512, 512);
  // Restrain the contrast of the measured grain instead of sharpening it.
  ctx.fillStyle = 'rgba(226,220,210,.52)';
  ctx.fillRect(0, 0, 512, 512);
  return canvasTexture(canvas);
}

export function plasterBumpTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1000; i++) {
    const x = (Math.sin(i * 123.13) * 1431.31 % 1 + 1) % 1 * 128;
    const y = (Math.sin(i * 33.51) * 2114.7 % 1 + 1) % 1 * 128;
    const gray = 125 + i % 22;
    ctx.fillStyle = `rgba(${gray},${gray},${gray},.35)`;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + i % 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = canvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function runnerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#667063';
  ctx.fillRect(0, 0, 256, 2048);
  ctx.strokeStyle = 'rgba(218,205,169,.30)';
  ctx.lineWidth = 5;
  ctx.strokeRect(13, 16, 230, 2016);
  ctx.strokeStyle = 'rgba(225,212,181,.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 28, 208, 1992);
  // A faded woven diamond, spaced widely enough to remain quiet in the distance.
  ctx.strokeStyle = 'rgba(225,212,181,.14)';
  ctx.lineWidth = 4;
  for (let y = 120; y < 2048; y += 250) {
    ctx.beginPath();
    ctx.moveTo(128, y - 65); ctx.lineTo(168, y); ctx.lineTo(128, y + 65); ctx.lineTo(88, y); ctx.closePath();
    ctx.stroke();
  }
  return canvasTexture(canvas);
}

// Three padded regions: a stamped leather spine, its matching cover and the
// warm paper edge. Low-contrast marks disappear gently into the mipmaps.
export function bookTexture(color, index) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 512);
  const spine = ctx.createLinearGradient(0, 0, 128, 0);
  spine.addColorStop(0, 'rgba(16,12,8,.22)');
  spine.addColorStop(.25, 'rgba(237,222,185,.06)');
  spine.addColorStop(.7, 'rgba(237,222,185,.025)');
  spine.addColorStop(1, 'rgba(16,12,8,.18)');
  ctx.fillStyle = spine;
  ctx.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 1400; i++) {
    const x = (Math.sin(i * 21.71 + index) * 781.31 % 1 + 1) % 1 * 256;
    const y = (Math.sin(i * 57.13 + index) * 471.37 % 1 + 1) % 1 * 512;
    ctx.fillStyle = i % 2 ? 'rgba(238,226,195,.025)' : 'rgba(18,14,9,.025)';
    ctx.fillRect(x, y, 2 + i % 3, 2 + i % 2);
  }
  ctx.fillStyle = 'rgba(224,199,142,.28)';
  for (const y of [56, 446]) ctx.fillRect(10, y, 108, 7);
  ctx.fillStyle = 'rgba(24,18,12,.15)';
  for (const y of [65, 455]) ctx.fillRect(10, y, 108, 5);
  const titles = ['ИСТОРИЯ', 'БОТАНИКА', 'АРХИТЕКТУРА', 'АТЛАС', 'ПОЭЗИЯ', 'ЭСТЕТИКА', 'ПУТЕШЕСТВИЯ', 'СОБРАНИЕ'];
  ctx.save();
  ctx.translate(64, 256);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(223,203,159,.62)';
  ctx.font = '18px Georgia, serif';
  ctx.fillText(titles[index % titles.length], 0, 0, 255);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.font = '18px Georgia, serif';
  ctx.fillText(['I', 'II', 'III', 'IV'][index % 4], 64, 397);
  ctx.strokeStyle = 'rgba(225,206,163,.12)';
  ctx.lineWidth = 5;
  ctx.strokeRect(146, 27, 91, 458);
  ctx.fillStyle = '#c8bea6';
  ctx.fillRect(256, 0, 256, 512);
  const pages = ctx.createLinearGradient(256, 0, 512, 0);
  pages.addColorStop(0, 'rgba(75,61,40,.11)');
  pages.addColorStop(.45, 'rgba(255,246,220,.10)');
  pages.addColorStop(1, 'rgba(75,61,40,.07)');
  ctx.fillStyle = pages;
  ctx.fillRect(256, 0, 256, 512);
  ctx.fillStyle = 'rgba(86,73,48,.055)';
  for (let y = 8; y < 512; y += 10 + index % 3) ctx.fillRect(256, y, 256, 2);
  const texture = canvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
