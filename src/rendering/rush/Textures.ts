import * as THREE from 'three';

/**
 * Small hand-drawn textures, painted on a canvas at start-up.
 *
 * Painting them in code keeps the whole look in one place and means there are no image assets to
 * license, compress, or wait for. Everything here is a few hundred pixels at most.
 */

function canvasTexture(
  width: number,
  height: number,
  paint: (g: CanvasRenderingContext2D) => void,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error(`2D canvas unavailable while painting a ${width}x${height} texture`);
  paint(g);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.anisotropy = 4;
  return texture;
}

/*
 * Ground masks. These are data, not pictures: red selects between a surface's two colours
 * (asphalt/line, grass/stripe, kerb/kerb) and green darkens for texture. The colours themselves
 * come from the world palette in the ground shader, which is what lets one road run through six
 * worlds and change colour at the boundary.
 */

export function roadMask(): THREE.CanvasTexture {
  const texture = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgb(0, ${Math.floor(Math.random() * 90)}, 0)`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
    g.fillStyle = '#ff0000';
    for (const x of [256 / 3, (256 * 2) / 3]) g.fillRect(x - 4, 20, 8, 110);
    g.fillRect(0, 0, 7, 256);
    g.fillRect(249, 0, 7, 256);
  }, THREE.NoColorSpace);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function grassMask(): THREE.CanvasTexture {
  const texture = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#ff0000';
    g.fillRect(0, 32, 64, 32);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(0, 255, 0, 0.35)`;
      g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
    }
  }, THREE.NoColorSpace);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function kerbMask(): THREE.CanvasTexture {
  const texture = canvasTexture(16, 64, (g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 16, 32);
    g.fillStyle = '#ff0000';
    g.fillRect(0, 32, 16, 32);
  }, THREE.NoColorSpace);
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
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

