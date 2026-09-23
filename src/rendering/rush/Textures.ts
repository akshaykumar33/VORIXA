import * as THREE from 'three';

/**
 * Small hand-drawn textures, painted on a canvas at start-up.
 *
 * Painting them in code keeps the whole look in one place and means there are no image assets to
 * license, compress, or wait for. Everything here is a few hundred pixels at most.
 */

function canvasTexture(width: number, height: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error(`2D canvas unavailable while painting a ${width}x${height} texture`);
  paint(g);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Asphalt with lane dashes. One tile is 3 lanes wide and 16 m long; it repeats along the road. */
export function roadTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#4a4f75';
    g.fillRect(0, 0, 256, 256);
    // Speckle, so the road visibly moves even where there are no dashes.
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
    // Lane dashes at the two lane boundaries (1/3 and 2/3 across).
    g.fillStyle = '#fff7e0';
    for (const x of [256 / 3, (256 * 2) / 3]) g.fillRect(x - 4, 20, 8, 110);
    // Edge lines.
    g.fillRect(0, 0, 7, 256);
    g.fillRect(249, 0, 7, 256);
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Red and white kerb stripes. */
export function kerbTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(16, 64, (g) => {
    g.fillStyle = '#ff4d5e';
    g.fillRect(0, 0, 16, 32);
    g.fillStyle = '#fff7e0';
    g.fillRect(0, 32, 16, 32);
  });
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/** Mown-lawn stripes, the cheapest way to make a flat field read as grass at speed. */
export function grassTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#7fd95b';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#6cc84c';
    g.fillRect(0, 0, 64, 32);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Diagonal hazard stripes for barriers. */
export function hazardTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 32, (g) => {
    g.fillStyle = '#fff7e0';
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#ff4d5e';
    for (let x = -32; x < 160; x += 32) {
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 16, 32);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 16, 0);
      g.closePath();
      g.fill();
    }
  });
}

/** Chevrons for ramps: yellow and ink, pointing the way up. */
export function chevronTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#ffc93c';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#1d1b33';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(8, 48);
    g.lineTo(32, 20);
    g.lineTo(56, 48);
    g.stroke();
  });
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Planks and a cross brace for crates. */
export function crateTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    g.fillStyle = '#d98f4e';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#c47a3c';
    for (let y = 0; y < 64; y += 16) g.fillRect(0, y + 14, 64, 2);
    g.strokeStyle = '#8f5226';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 58, 58);
    g.beginPath();
    g.moveTo(6, 6);
    g.lineTo(58, 58);
    g.stroke();
  });
}

/** Truck trailer livery: a bold stripe and a cartoon logo dot. */
export function trailerTexture(color: string): THREE.CanvasTexture {
  return canvasTexture(128, 64, (g) => {
    g.fillStyle = '#f4f1ea';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = color;
    g.fillRect(0, 36, 128, 12);
    g.beginPath();
    g.arc(40, 20, 10, 0, Math.PI * 2);
    g.fill();
    g.fillRect(58, 14, 50, 5);
    g.fillRect(58, 23, 34, 5);
  });
}

/** Vertical sky gradient, painted once and used as the scene background. */
export function skyTexture(): THREE.CanvasTexture {
  return canvasTexture(4, 256, (g) => {
    const gradient = g.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#3fa7ff');
    gradient.addColorStop(0.55, '#8fd3ff');
    gradient.addColorStop(0.8, '#ffe2b8');
    gradient.addColorStop(1, '#ffc79a');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 4, 256);
  });
}
