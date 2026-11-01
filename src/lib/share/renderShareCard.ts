import { SHARE_CARD_TEXT, shareLink, type ShareMoment } from "@/lib/share/shareMoment";

// วาดการ์ดแชร์ 1080×1920 ฝั่ง client — ใช้ได้เฉพาะใน browser
// ชื่อบนการ์ดรับเฉพาะชื่อ Qmon ห้ามส่ง username/โรงเรียน/ชั้น/ชื่อในห้องเรียนเข้ามา

const WIDTH = 1080;
const HEIGHT = 1920;
const CENTER = WIDTH / 2;
// เว้นบน/ล่างประมาณ 250px ให้ UI ของ story — เนื้อหาทั้งหมดต้องอยู่ระหว่างนี้
const SAFE_TOP = 250;
const SAFE_BOTTOM = HEIGHT - 250;
// รูปต้นฉบับ 500×500 ขยายเกินราว 700px จะเริ่มแตก
const IMAGE_SIZE = 640;
const EVOLVE_BEFORE_SIZE = 200;
const EVOLVE_AFTER_SIZE = 560;

// สีจาก globals.css: --pet-sky/--pet-zap-bg · --quiz-journey-bg/--quiz-route-fill · --color-track/--color-gold-dim/--color-gold-hi
const PALETTE: Record<ShareMoment, { stops: string[]; accent: string }> = {
  hatch: { stops: ["#3b2a7a", "#6a3fa0", "#e0729a"], accent: "#ffd166" },
  evolve: { stops: ["#243d3e", "#365f59"], accent: "#a0e0c9" },
  perfect: { stops: ["#15171c", "#5f4f30"], accent: "#ecd7a0" },
};
const INK = "#15171c";

export type ShareCardInput = {
  moment: ShareMoment;
  nickname: string;
  imageBefore?: string | null;
  imageAfter: string;
  stat: string;
};

async function loadFontFamily(text: string): Promise<string> {
  const kanit = getComputedStyle(document.documentElement).getPropertyValue("--font-kanit").trim();
  if (kanit) {
    try {
      const faces = await Promise.all([
        document.fonts.load(`700 80px ${kanit}`, text),
        document.fonts.load(`500 40px ${kanit}`, text),
      ]);
      if (faces.every((f) => f.length > 0)) return kanit;
    } catch {
      // ตกไปใช้ Anuphan ด้านล่าง
    }
  }
  const [bold, medium] = await Promise.all([
    new FontFace("ShareAnuphan", "url(/2048/assets/anuphan-700.ttf)", { weight: "700" }).load(),
    new FontFace("ShareAnuphan", "url(/2048/assets/anuphan-600.ttf)", { weight: "500" }).load(),
  ]);
  document.fonts.add(bold);
  document.fonts.add(medium);
  return "ShareAnuphan";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`load image failed: ${src}`));
    img.src = src;
  });
}

function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  weight: number,
  size: number,
  family: string
) {
  let current = size;
  ctx.font = `${weight} ${current}px ${family}`;
  while (current > 28 && ctx.measureText(text).width > maxWidth) {
    current -= 2;
    ctx.font = `${weight} ${current}px ${family}`;
  }
  ctx.fillText(text, x, y);
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const { moment, nickname, imageBefore, imageAfter, stat } = input;
  const palette = PALETTE[moment];
  const title = SHARE_CARD_TEXT.title[moment];
  const allText = [SHARE_CARD_TEXT.wordmark, title, nickname, stat, SHARE_CARD_TEXT.site, SHARE_CARD_TEXT.invite].join("");

  const [family, after, before, QRCode] = await Promise.all([
    loadFontFamily(allText),
    loadImage(imageAfter),
    imageBefore ? loadImage(imageBefore) : Promise.resolve(null),
    import("qrcode"),
  ]);
  const qrDataUrl = await QRCode.toDataURL(shareLink(moment), { width: 280, margin: 1, errorCorrectionLevel: "M" });
  const qr = await loadImage(qrDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  palette.stops.forEach((color, i) => bg.addColorStop(i / (palette.stops.length - 1), color));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const imageTop = SAFE_TOP + 190;
  const imageBottom = imageTop + IMAGE_SIZE;

  const glow = ctx.createRadialGradient(CENTER, imageTop + IMAGE_SIZE / 2, 60, CENTER, imageTop + IMAGE_SIZE / 2, 470);
  glow.addColorStop(0, `${palette.accent}66`);
  glow.addColorStop(1, `${palette.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, imageTop - 150, WIDTH, IMAGE_SIZE + 300);

  ctx.fillStyle = palette.accent;
  for (const [x, y, r] of [[130, 560, 26], [950, 500, 34], [100, 960, 20], [980, 900, 24], [205, 690, 14], [880, 1040, 16]]) {
    drawSparkle(ctx, x, y, r);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.accent;
  ctx.font = `700 52px ${family}`;
  ctx.fillText(SHARE_CARD_TEXT.wordmark, CENTER, SAFE_TOP + 52);

  ctx.fillStyle = "#ffffff";
  drawFittedText(ctx, title, CENTER, SAFE_TOP + 150, 940, 700, 80, family);

  if (before) {
    const afterX = WIDTH - 60 - EVOLVE_AFTER_SIZE;
    const afterY = imageTop + (IMAGE_SIZE - EVOLVE_AFTER_SIZE) / 2;
    const beforeX = 60;
    const beforeY = imageTop + (IMAGE_SIZE - EVOLVE_BEFORE_SIZE) / 2;
    ctx.drawImage(before, beforeX, beforeY, EVOLVE_BEFORE_SIZE, EVOLVE_BEFORE_SIZE);
    ctx.drawImage(after, afterX, afterY, EVOLVE_AFTER_SIZE, EVOLVE_AFTER_SIZE);
    const arrowY = imageTop + IMAGE_SIZE / 2;
    const arrowX = beforeX + EVOLVE_BEFORE_SIZE + 18;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY - 26);
    ctx.lineTo(arrowX + 40, arrowY);
    ctx.lineTo(arrowX, arrowY + 26);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.drawImage(after, CENTER - IMAGE_SIZE / 2, imageTop, IMAGE_SIZE, IMAGE_SIZE);
  }

  ctx.fillStyle = "#ffffff";
  drawFittedText(ctx, nickname, CENTER, imageBottom + 74, 920, 700, 68, family);
  ctx.fillStyle = palette.accent;
  drawFittedText(ctx, stat, CENTER, imageBottom + 164, 920, 700, 78, family);

  const boxHeight = 300;
  const boxTop = SAFE_BOTTOM - boxHeight;
  const boxLeft = 80;
  const boxWidth = WIDTH - boxLeft * 2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(boxLeft, boxTop, boxWidth, boxHeight, 36);
  ctx.fill();
  const qrSize = 260;
  ctx.drawImage(qr, boxLeft + 20, boxTop + 20, qrSize, qrSize);

  const textX = boxLeft + 20 + qrSize + 28;
  const textWidth = boxLeft + boxWidth - 28 - textX;
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  drawFittedText(ctx, SHARE_CARD_TEXT.site, textX, boxTop + 128, textWidth, 700, 56, family);
  drawFittedText(ctx, SHARE_CARD_TEXT.invite, textX, boxTop + 196, textWidth, 500, 38, family);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}
