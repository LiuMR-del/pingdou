import type { Settings, SourceImage } from './model';
export async function decodeImage(src: string): Promise<HTMLImageElement> {
  const image = new Image(); image.src = src; await image.decode(); return image;
}
export async function readImage(file: File): Promise<SourceImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请使用 JPG、PNG 或 WebP 图片。HEIC、GIF 暂不支持。');
  if (file.size > 20 * 1024 * 1024) throw new Error('图片超过 20 MB，请缩小后再试。');
  const url = URL.createObjectURL(file);
  try {
    const image = await decodeImage(url);
    if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('图片超过 4000 万像素，请先缩小。');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { name: file.name.replace(/\.[^.]+$/, '').slice(0, 100), dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  } finally { URL.revokeObjectURL(url); }
}
export async function preparePixels(source: SourceImage, settings: Settings) {
  const image = await decodeImage(source.dataUrl);
  const rotated = document.createElement('canvas'); const turn = ((settings.rotation % 360) + 360) % 360; const swapped = turn === 90 || turn === 270;
  rotated.width = swapped ? source.height : source.width; rotated.height = swapped ? source.width : source.height;
  const rc = rotated.getContext('2d')!; rc.translate(rotated.width / 2, rotated.height / 2); rc.rotate(turn * Math.PI / 180); rc.drawImage(image, -source.width / 2, -source.height / 2);
  const c = settings.crop ?? { x: 0, y: 0, width: rotated.width, height: rotated.height };
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(c.width)); canvas.height = Math.max(1, Math.round(c.height));
  const ctx = canvas.getContext('2d')!; ctx.drawImage(rotated, c.x, c.y, c.width, c.height, 0, 0, canvas.width, canvas.height);
  return { pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height, preview: canvas.toDataURL('image/png') };
}
export function sampleSource(): SourceImage {
  const c = document.createElement('canvas'); c.width = 400; c.height = 400; const x = c.getContext('2d')!;
  x.fillStyle = '#f4e8d8'; x.fillRect(0, 0, 400, 400);
  x.fillStyle = '#92b7a0'; x.beginPath(); x.ellipse(200, 336, 154, 22, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f8bd78'; x.beginPath(); x.moveTo(104, 163); x.lineTo(100, 65); x.lineTo(167, 116); x.lineTo(234, 116); x.lineTo(300, 65); x.lineTo(296, 165); x.closePath(); x.fill();
  x.fillStyle = '#e38e82'; for (const [a,b,d] of [[112,89,148],[288,89,252]]) { x.beginPath(); x.moveTo(a,b); x.lineTo(a,147); x.lineTo(d,121); x.fill(); }
  x.fillStyle = '#f8bd78'; x.beginPath(); x.ellipse(200, 207, 112, 110, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff4df'; x.beginPath(); x.ellipse(200, 254, 77, 56, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#344b42'; for (const a of [156,244]) { x.beginPath(); x.ellipse(a, 202, 10, 15, 0, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#b75a58'; x.beginPath(); x.moveTo(188,235); x.lineTo(212,235); x.lineTo(200,247); x.fill();
  x.strokeStyle = '#715744'; x.lineWidth=4; x.lineCap='round'; x.beginPath(); x.moveTo(200,247); x.lineTo(200,256); x.quadraticCurveTo(190,269,181,259); x.moveTo(200,256); x.quadraticCurveTo(210,269,219,259); x.stroke();
  x.fillStyle='#e89c8c'; for(const a of [128,272]) {x.beginPath();x.ellipse(a,237,17,9,0,0,Math.PI*2);x.fill();}
  return { name: '小橘猫 · 自制示例', dataUrl: c.toDataURL('image/png'), width: 400, height: 400 };
}
