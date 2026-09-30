#!/usr/bin/env python3
"""เตรียม sprite Qmon: PNG master (2048x2048, 16 เฟรม) -> WebP ที่จัดเฟรมแล้ว + manifest + รายงาน QC

ใช้:  scripts/sprite/.venv/Scripts/python scripts/sprite/prepare_qmon_sprites.py [--only egg1_stage2_baby ...]
      [--cell N] [--out-scale 0.75] [--quality 85] [--plan-only] [--max-cell 600]

ลำดับ: (pass 1) แยกเฟรมทั้ง 40 sheet + คำนวณ extents -> เลือก cell/baseline กลางตัวเดียวทุก key
       (pass 2) ตรึงเท้า/จับคู่ Idle<->Happy -> วางลงช่อง -> ล้าง alpha -> WebP + manifest -> รายงาน QC
ความหมาย option:
  --cell       ขนาดช่อง (พื้นที่ว่าง) เท่านั้น ไม่ scale ตัวละคร · ไม่ระบุ = เลือกเล็กสุดที่ทุกตัวไม่ล้น (+margin 4px, เลขคู่)
  --out-scale  ย่อทั้งชุดตอน export (<=1) เช่น 0.75 -> ไว้ทำ 384/512 ทีหลัง
ผลการแยกเฟรมเก็บ cache ที่ output/sprite-qc/cache (รันซ้ำเปลี่ยน --cell/--out-scale ได้เร็ว) · รันซ้ำได้ผลเดิม
"""
import argparse
import hashlib
import json
import math
import pickle
import re
import statistics
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / "assets-src" / "sprite"
OUT_DIR = ROOT / "public" / "pets" / "anim"
STATIC_DIR = ROOT / "public" / "pets"
MANIFEST = ROOT / "src" / "data" / "qmonSpriteManifest.json"
QC_DIR = ROOT / "output" / "sprite-qc"
CACHE_DIR = QC_DIR / "cache"
CONFIG = Path(__file__).with_name("sprite-config.json")

GUTTER = 2
COLS = ROWS = 4
FRAMES = COLS * ROWS
ALPHA_MASK = 128      # alpha ที่นับเป็นตัวละครตอนแยกก้อน
ALPHA_MIN = 8         # alpha ต่ำกว่านี้ = 0 (ล้างเศษ)
DILATE = 2            # ขยาย mask ก่อน label
BIG_FRAC = 0.15       # ก้อนหลัก = ใหญ่กว่า 15% ของก้อนใหญ่สุด
TINY_MIN = 15         # ชิ้นลอยที่ต้องผูกกลับ (px ของ alpha>128)
ATTACH_PAD = 40       # ชิ้นเล็ก (<15px) ผูกได้ถ้าห่างก้อนหลักไม่เกินนี้
ATTACH_MAX = 150      # ชิ้นลอย >=15px ไกลกว่านี้ = ผูกไม่ได้ (ลงรายงาน)
GLOW_RADIUS = 24      # เก็บพิกเซล alpha>=8 ที่ห่างจาก mask ของเฟรมไม่เกินนี้ (แบ่งตามเฟรมที่ใกล้สุด)
FOOT_BAND = 0.2       # anchor แนวนอน = กึ่งกลางของส่วนล่าง 20% ของก้อนหลัก
MARGIN = 4            # ขอบเผื่อรอบ extents ทั้งชุด
SEAM_LIMIT = 2.0
DEFAULTS = {
    "idle": {"lockBaseline": True, "pingPong": False, "fps": 8, "pairScale": 1.0},
    "happy": {"lockBaseline": False, "pingPong": False, "fps": 12, "pairScale": 1.0},
}
NAME_RE = re.compile(r"^(egg[1-5]_stage[23]_(?:baby|math|science|balance))_(idle|happy)\.png$")
PINK = (255, 182, 193, 255)
PARAMS_SIG = repr((ALPHA_MASK, ALPHA_MIN, DILATE, BIG_FRAC, TINY_MIN, ATTACH_PAD, ATTACH_MAX, GLOW_RADIUS, FOOT_BAND, "v3"))


class SheetError(Exception):
    def __init__(self, msg, info):
        super().__init__(msg)
        self.info = info


class Frame:
    def __init__(self, arr, x0, y0, ax, ay, mw, mh):
        self.arr, self.x0, self.y0 = arr, x0, y0   # crop RGBA + มุมซ้ายบนบนชีตเดิม
        self.ax, self.ay = ax, ay                  # anchor (กึ่งกลางเท้า) บนชีตเดิม
        self.mw, self.mh = mw, mh                  # ขนาดก้อนหลัก
        self.sx = self.sy = 0.0                    # anchor เทียบตำแหน่งช่องกริดปกติ (ใช้กับ Happy ที่ไม่ล็อกเท้า)


def split_sheet(path):
    rgba = np.array(Image.open(path).convert("RGBA"))
    alpha = rgba[:, :, 3]
    a = alpha > ALPHA_MASK
    lab, n = ndi.label(ndi.binary_dilation(a, iterations=DILATE))
    sizes = np.array(ndi.sum(a, lab, range(1, n + 1)))
    slices = ndi.find_objects(lab)
    top = float(sizes.max())
    big = [i for i in range(n) if sizes[i] > BIG_FRAC * top]
    info = {"components": n, "big": len(big), "max_blob_px": int(max(
        max(slices[i][0].stop - slices[i][0].start, slices[i][1].stop - slices[i][1].start) for i in big)) if big else 0}
    if len(big) != FRAMES:
        raise SheetError(f"พบก้อนหลัก {len(big)} ก้อน (ต้อง {FRAMES})", info)

    def bbox(i):
        s = slices[i]
        return s[1].start, s[0].start, s[1].stop, s[0].stop  # x0,y0,x1,y1

    cx = {i: (bbox(i)[0] + bbox(i)[2]) / 2 for i in big}
    cy = {i: (bbox(i)[1] + bbox(i)[3]) / 2 for i in big}
    by_y = sorted(big, key=lambda i: (cy[i], cx[i]))
    rows = [sorted(by_y[r * COLS:(r + 1) * COLS], key=lambda i: cx[i]) for r in range(ROWS)]
    for r in range(ROWS - 1):
        if max(cy[i] for i in rows[r]) >= min(cy[i] for i in rows[r + 1]):
            raise SheetError("แถวของก้อนซ้อนกัน จัดกลุ่มแถวไม่ได้", info)
    order = [i for row in rows for i in row]  # index ก้อน ตามลำดับเฟรม 0..15

    cg = np.zeros(n + 1, dtype=np.uint8)  # label -> เลขเฟรม (1..16)
    for g, i in enumerate(order, start=1):
        cg[i + 1] = g

    tiny_bound, tiny_unbound, specks_dropped = [], [], 0
    big_set = set(big)
    coms = ndi.center_of_mass(a, lab, range(1, n + 1))
    for i in range(n):
        if i in big_set:
            continue
        py, px = coms[i]
        best, best_d = None, 1e9
        for g, bi in enumerate(order, start=1):
            x0, y0, x1, y1 = bbox(bi)
            d = math.hypot(max(x0 - px, 0, px - x1), max(y0 - py, 0, py - y1))
            if d < best_d:
                best, best_d = g, d
        if sizes[i] >= TINY_MIN:
            if best_d <= ATTACH_MAX:
                cg[i + 1] = best
                tiny_bound.append({"px": int(sizes[i]), "frame": best - 1, "dist": round(best_d, 1)})
            else:
                tiny_unbound.append({"px": int(sizes[i]), "at": [int(px), int(py)], "dist": round(best_d, 1)})
        elif best_d <= ATTACH_PAD:
            cg[i + 1] = best
        else:
            specks_dropped += 1

    # core = พิกเซลทึบของแต่ละเฟรม · glow = พิกเซล alpha>=8 ที่อยู่ในระยะ GLOW_RADIUS จาก core ของเฟรมที่ใกล้สุด
    core = np.where(a, cg[lab], 0).astype(np.uint8)
    dist, (iy, ix) = ndi.distance_transform_edt(core == 0, return_indices=True)
    near = core[iy, ix]
    G = np.where((alpha >= ALPHA_MIN) & (dist <= GLOW_RADIUS) & (near > 0), near, 0).astype(np.uint8)
    cut_px = int(((alpha >= ALPHA_MIN) & (G == 0)).sum())
    cut_solid = int(((alpha > ALPHA_MASK) & (G == 0)).sum())
    gslices = ndi.find_objects(G, max_label=FRAMES)

    frames = []
    for g, bi in enumerate(order, start=1):
        sl = gslices[g - 1]
        crop = rgba[sl].copy()
        crop[G[sl] != g] = 0
        ms = slices[bi]
        m = (lab[ms] == bi + 1) & a[ms]
        my, mx = np.nonzero(m)
        my, mx = my + ms[0].start, mx + ms[1].start
        h = my.max() - my.min() + 1
        w = mx.max() - mx.min() + 1
        band = my >= my.max() - FOOT_BAND * h
        ax = (mx[band].min() + mx[band].max() + 1) / 2
        frames.append(Frame(crop, int(sl[1].start), int(sl[0].start), float(ax), int(my.max() + 1), int(w), int(h)))
    # fit กริดปกติ (least squares) แล้วเก็บ residual ของ anchor = การเคลื่อนที่จริงเทียบช่อง
    idx = np.arange(FRAMES)
    for axis, vals, key in ((0, [fr.ax for fr in frames], idx % COLS), (1, [fr.ay for fr in frames], idx // COLS)):
        slope, icpt = np.polyfit(key, vals, 1)
        for fr, k, v in zip(frames, key, vals):
            res = v - (icpt + slope * k)
            if axis == 0:
                fr.sx = float(res)
            else:
                fr.sy = float(res)
    info.update({
        "tiny_bound": tiny_bound, "tiny_unbound": tiny_unbound, "specks_dropped": specks_dropped,
        "cut_px": cut_px, "cut_solid_px": cut_solid,
        "bottom_margin": int(alpha.shape[0] - max(bbox(i)[3] for i in big)),
        "med_h": float(statistics.median(fr.mh for fr in frames)),
        "med_w": float(statistics.median(fr.mw for fr in frames)),
    })
    return frames, info


def load_sheet(path):
    """split + cache (แยกเฟรมช้า ~ครึ่งนาที/ชีต) — ผิดพลาดแบบ SheetError ก็ cache ไม่ได้ ให้รันใหม่ทุกครั้ง"""
    st = path.stat()
    sig = hashlib.sha1(f"{PARAMS_SIG}|{path.name}|{st.st_size}|{st.st_mtime_ns}".encode()).hexdigest()[:12]
    cp = CACHE_DIR / f"{path.stem}.{sig}.pkl"
    if cp.exists():
        with open(cp, "rb") as fh:
            dicts, info = pickle.load(fh)
        frames = []
        for d in dicts:  # เก็บเป็น dict ธรรมดา ไม่ผูกกับชื่อ module ของ class
            fr = Frame.__new__(Frame)
            fr.__dict__.update(d)
            frames.append(fr)
        return frames, info
    t0 = time.time()
    res = split_sheet(path)
    res[1]["split_sec"] = round(time.time() - t0, 1)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for old in CACHE_DIR.glob(f"{path.stem}.*.pkl"):
        old.unlink()
    with open(cp, "wb") as fh:
        pickle.dump(([fr.__dict__ for fr in res[0]], res[1]), fh, protocol=pickle.HIGHEST_PROTOCOL)
    return res


def transform_clip(frames, lock, scale):
    """คืน [(arr, rx, ry)] โดย rx,ry = มุมซ้ายบนเทียบ anchor ของช่องใหม่ (scale > 1 ใช้กับ pairScale ของ Happy ได้)"""
    sx0, sy0 = frames[0].sx, frames[0].sy
    out = []
    for f in frames:
        # lock: anchor ของเฟรมนั้นตรงช่อง · ไม่ lock: เลื่อนตามการเคลื่อนที่จริงเทียบเฟรม 0 (เก็บการเด้ง)
        bx, by = (f.ax, f.ay) if lock else (f.ax - (f.sx - sx0), f.ay - (f.sy - sy0))
        rx, ry = f.x0 - bx, f.y0 - by
        arr = f.arr
        if abs(scale - 1) > 1e-9:
            h, w = arr.shape[:2]
            nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
            im = Image.fromarray(arr, "RGBA").convert("RGBa").resize((nw, nh), Image.LANCZOS).convert("RGBA")
            arr = np.array(im)
            arr[arr[:, :, 3] < ALPHA_MIN] = 0
            rx, ry = round(rx * scale), round(ry * scale)
        out.append((arr, int(round(rx)), int(round(ry))))
    return out


def extents(tf):
    left = right = up = down = 0
    for arr, rx, ry in tf:
        h, w = arr.shape[:2]
        left, right = max(left, -rx), max(right, rx + w)
        up, down = max(up, -ry), max(down, ry + h)
    return left, right, up, down


def render_cells(tf, axc, yc, cell):
    cells = []
    for arr, rx, ry in tf:
        c = np.zeros((cell, cell, 4), dtype=np.uint8)
        h, w = arr.shape[:2]
        x0, y0 = axc + rx, yc + ry
        assert x0 >= 0 and y0 >= 0 and x0 + w <= cell and y0 + h <= cell, "ภาพล้นช่อง (ห้ามตัด)"
        c[y0:y0 + h, x0:x0 + w] = arr
        c[c[:, :, 3] < ALPHA_MIN] = 0  # alpha<8 -> 0 และ RGB = 0
        cells.append(c)
    return cells


def assemble(cells, cell):
    side = COLS * cell + (COLS - 1) * GUTTER
    sheet = np.zeros((side, side, 4), dtype=np.uint8)
    for i, c in enumerate(cells):
        r, col = divmod(i, COLS)
        y, x = r * (cell + GUTTER), col * (cell + GUTTER)
        sheet[y:y + cell, x:x + cell] = c
    return sheet


def prem(c):
    f = c.astype(np.float32)
    f[..., :3] *= f[..., 3:4] / 255.0
    return f


def seam_ratio(cells):
    p = [prem(c) for c in cells]
    adj = [float(np.abs(p[i + 1] - p[i]).mean()) for i in range(FRAMES - 1)]
    med = statistics.median(adj)
    return float(np.abs(p[-1] - p[0]).mean()) / med if med > 0 else float("inf")


def composite(arr, bg_color):
    bg = Image.new("RGBA", (arr.shape[1], arr.shape[0]), bg_color)
    return Image.alpha_composite(bg, Image.fromarray(arr, "RGBA"))


def contact_image(sheet, cell, axc, yc, path, bg_color=PINK):
    im = composite(sheet, bg_color)
    d = ImageDraw.Draw(im)
    for i in range(FRAMES):
        r, c = divmod(i, COLS)
        x, y = c * (cell + GUTTER), r * (cell + GUTTER)
        d.rectangle([x, y, x + cell - 1, y + cell - 1], outline=(90, 90, 90, 255))
        d.line([x + axc - 12, y + yc, x + axc + 12, y + yc], fill=(0, 120, 255, 255), width=2)
        d.line([x + axc, y + yc - 12, x + axc, y + yc + 12], fill=(0, 120, 255, 255), width=2)
    half = im.size[0] // 2
    im.resize((half, half), Image.LANCZOS).convert("RGB").save(path)


def outline(mask):
    return mask & ~ndi.binary_erosion(mask, iterations=2)


def align_static(key, idle0):
    """ย่อรูปนิ่งให้สูงเท่าก้อนทึบของ Idle เฟรม 0 แล้ววางชิดล่าง/กึ่งกลางแนวนอนเดียวกัน
    คืน (รูปนิ่งที่ย่อแล้ว, ox, oy) = ตำแหน่งมุมซ้ายบนของรูปนิ่งในพิกัดช่อง sprite (อาจติดลบ) หรือ None"""
    static_p = STATIC_DIR / f"{key}.png"
    if not static_p.exists():
        return None
    st = Image.open(static_p).convert("RGBA")
    bb = st.getchannel("A").point(lambda v: 255 if v > ALPHA_MASK else 0).getbbox()
    ys, xs = np.nonzero(idle0[:, :, 3] > ALPHA_MASK)
    if not bb or not len(ys):
        return None
    s = (ys.max() - ys.min() + 1) / (bb[3] - bb[1])
    st = st.resize((max(1, round(st.size[0] * s)), max(1, round(st.size[1] * s))), Image.LANCZOS)
    bb = st.getchannel("A").point(lambda v: 255 if v > ALPHA_MASK else 0).getbbox()
    ox = int((xs.min() + xs.max()) / 2 - (bb[0] + bb[2]) / 2)
    oy = int(ys.max() + 1 - bb[3])
    return st, ox, oy


def static_fit(key, idle0, cell):
    """staticFit ใน manifest: ถ้าวาดรูปนิ่งเต็มกรอบสี่เหลี่ยมจัตุรัส W x W (มุมซ้ายบน = 0,0)
    ช่อง sprite ต้องวาดเป็นสี่เหลี่ยมจัตุรัสด้านยาว scale*W โดยมุมซ้ายบนอยู่ที่ (dx*W, dy*W)
    -> ตัวละครทับกับรูปนิ่งพอดี (ค่าเดียวกับที่ใช้ทำ overlay)"""
    al = align_static(key, idle0)
    if not al:
        return None
    st, ox, oy = al
    assert st.size[0] == st.size[1], "รูปนิ่งต้องเป็นสี่เหลี่ยมจัตุรัส"
    side = st.size[0]
    return {"scale": round(cell / side, 5), "dx": round(-ox / side, 5), "dy": round(-oy / side, 5)}


def overlay_image(key, idle0, happy0, cell, path):
    panels = [composite(idle0, PINK), composite(happy0, PINK)]
    al = align_static(key, idle0)
    stat_im = None
    if al:
        st, ox, oy = al
        canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        canvas.paste(st, (ox, oy), st)
        stat_im = np.array(canvas)
    panels.append(composite(stat_im, PINK) if stat_im is not None else Image.new("RGBA", (cell, cell), PINK))
    o = np.array(Image.new("RGBA", (cell, cell), PINK))
    for arr, col in ((idle0, (255, 0, 0)), (happy0, (0, 60, 255)), (stat_im, (0, 160, 0))):
        if arr is not None:
            o[outline(arr[:, :, 3] > ALPHA_MASK)] = (*col, 255)
    panels.append(Image.fromarray(o, "RGBA"))
    strip = Image.new("RGBA", (cell * 4, cell))
    for i, p in enumerate(panels):
        strip.paste(p, (i * cell, 0))
    strip.convert("RGB").save(path)


def even_up(n):
    return int(math.ceil(n / 2.0) * 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cell", type=int, default=None, help="ขนาดช่อง (ไม่ระบุ = เลือกเล็กสุดที่ทุก key ไม่ล้น)")
    ap.add_argument("--out-scale", type=float, default=1.0, help="ย่อทั้งชุดตอน export (<=1)")
    ap.add_argument("--max-cell", type=int, default=600)
    ap.add_argument("--quality", type=int, default=85)
    ap.add_argument("--only", nargs="*", default=None, help="render เฉพาะ key เช่น egg1_stage2_baby (extents/cell คิดจากทั้ง 40 เสมอ)")
    ap.add_argument("--plan-only", action="store_true")
    ap.add_argument("--manifest-only", action="store_true", help="เขียน manifest (รวม staticFit) อย่างเดียว ไม่เขียน WebP/รายงาน/ภาพ QC")
    args = ap.parse_args()
    if not 0 < args.out_scale <= 1:
        sys.exit("--out-scale ต้องอยู่ในช่วง (0,1]")
    config = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}

    keys = {}
    for p in sorted(SRC_DIR.glob("*.png")):
        m = NAME_RE.match(p.name)
        if m:
            keys.setdefault(m.group(1), {})[m.group(2)] = p
    for k, pair in keys.items():
        if set(pair) != {"idle", "happy"}:
            sys.exit(f"{k}: ไม่ครบคู่ idle/happy")

    def opts_of(key, clip):
        o = {**DEFAULTS[clip], **config.get(f"{key}_{clip}", {})}
        # Idle ต้องตรงกับรูปนิ่ง (กัน fade กระโดด) -> ปรับเฉพาะ Happy ให้เท่า Idle เท่านั้น
        if clip == "idle" and o["pairScale"] != 1.0:
            sys.exit(f"{key}_idle: ห้ามตั้ง pairScale ให้ Idle (ต้องตรงกับรูปนิ่ง)")
        if not 0.85 <= o["pairScale"] <= 1.20:
            sys.exit(f"{key}_{clip}: pairScale ต้องอยู่ในช่วง 0.85-1.20")
        return o

    # ---- pass 1: แยกเฟรมทั้งหมด + extents ----
    sheets, ext, failures = {}, {}, []
    t0 = time.time()
    for key in sorted(keys):
        try:
            sheets[key] = {c: load_sheet(keys[key][c]) for c in ("idle", "happy")}
        except SheetError as e:
            failures.append((key, str(e)))
            print(f"FAIL {key}: {e}", flush=True)
            continue
        ext[key] = {}
        for c in ("idle", "happy"):
            o = opts_of(key, c)
            tf = transform_clip(sheets[key][c][0], o["lockBaseline"], o["pairScale"] * args.out_scale)
            ext[key][c] = extents(tf)
        print(f"pass1 {key} ({time.time() - t0:.0f}s)", flush=True)
    if failures:
        write_report([], failures, None, args, sheets)
        sys.exit("มี sheet ที่แยกเฟรมไม่ผ่าน ดู report.md")

    # แนวนอน: จัดต่อ key ที่กึ่งกลางกรอบรวมของ Idle+Happy (ค่าเดียวกันทั้งคู่ ไม่ใช้เท้าเป็นตัวกลาง)
    # แนวตั้ง: baseline เดียวกันทุก key
    keyLR = {k: (max(e[0] for e in ext[k].values()), max(e[1] for e in ext[k].values())) for k in ext}
    shift = {k: -round((keyLR[k][1] - keyLR[k][0]) / 2) for k in ext}  # ระยะเลื่อน anchor จากกลางช่อง
    W = max(l + r for l, r in keyLR.values())
    U = max(e[2] for k in ext for e in ext[k].values())
    D = max(e[3] for k in ext for e in ext[k].values())
    cell_h = W + 2 * MARGIN
    cell_v = U + D + 2 * MARGIN
    auto_cell = even_up(max(cell_h, cell_v))
    cell = args.cell or auto_cell
    axc = cell // 2
    yc = cell - D - MARGIN
    drivers = {
        "width": max((keyLR[k][0] + keyLR[k][1], k) for k in keyLR),
        "up": max((ext[k][c][2], f"{k}_{c}") for k in ext for c in ext[k]),
        "down": max((ext[k][c][3], f"{k}_{c}") for k in ext for c in ext[k]),
    }
    plan = (f"extents ทั้ง 40 sheet (out-scale {args.out_scale}): width(L+R ต่อ key)={W} up={U} down={D}\n"
            f"cell กว้าง={cell_h} สูง={cell_v} -> auto cell={auto_cell} | ใช้ cell={cell} axc={axc} baseline={yc}\n"
            f"ตัวกำหนด: " + ", ".join(f"{n}={v[0]} ({v[1]})" for n, v in drivers.items()))
    print(plan, flush=True)
    (QC_DIR).mkdir(parents=True, exist_ok=True)
    (QC_DIR / "plan.txt").write_text(plan + "\n", encoding="utf-8")
    bad = [k for k in ext if axc + shift[k] - keyLR[k][0] < 0 or axc + shift[k] + keyLR[k][1] > cell]
    if bad or U > yc or D > cell - yc:
        print(f"OVERFLOW ที่ cell={cell}: ห้ามตัดภาพ -> หยุด {bad}", flush=True)
        sys.exit(3)
    if cell > args.max_cell:
        print(f"cell={cell} เกิน --max-cell {args.max_cell} -> หยุดถามก่อน", flush=True)
        sys.exit(2)
    if args.plan_only:
        return 0

    # ---- pass 2: render ----
    for sub in ("contact", "contact_black", "overlay"):
        (QC_DIR / sub).mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "cell": cell, "gutter": GUTTER, "columns": COLS, "rows": ROWS, "sprites": {}}
    if MANIFEST.exists() and args.only:
        old = json.loads(MANIFEST.read_text(encoding="utf-8"))
        if old.get("cell") == cell:
            manifest["sprites"] = old.get("sprites", {})

    rows = []
    for key in sorted(keys):
        if args.only and key not in args.only:
            continue
        sprite_entry, cells_by = {}, {}
        for c in ("idle", "happy"):
            o = opts_of(key, c)
            frames, info = sheets[key][c]
            sc = o["pairScale"] * args.out_scale
            tf = transform_clip(frames, o["lockBaseline"], sc)
            cells = render_cells(tf, axc + shift[key], yc, cell)
            cells_by[c] = cells
            sprite_entry[c] = {
                "src": f"/pets/anim/{key}_{c}.webp", "frames": FRAMES, "fps": o["fps"], "pingPong": bool(o["pingPong"]),
            }
            if args.manifest_only:
                continue
            sheet = assemble(cells, cell)
            out = OUT_DIR / f"{key}_{c}.webp"
            Image.fromarray(sheet, "RGBA").save(out, "WEBP", quality=args.quality, method=6)
            chk = Image.open(out)
            chk.load()
            side = COLS * cell + (COLS - 1) * GUTTER
            arr = np.array(chk.convert("RGBA"))
            nonempty = sum(
                int(arr[(i // COLS) * (cell + GUTTER):(i // COLS) * (cell + GUTTER) + cell,
                        (i % COLS) * (cell + GUTTER):(i % COLS) * (cell + GUTTER) + cell, 3].max() > 0)
                for i in range(FRAMES))
            ok = chk.size == (side, side) and nonempty == FRAMES
            contact_image(sheet, cell, axc + shift[key], yc, QC_DIR / "contact" / f"{key}_{c}.png")
            contact_image(sheet, cell, axc + shift[key], yc, QC_DIR / "contact_black" / f"{key}_{c}.png", (0, 0, 0, 255))
            dy = [(fr.sy - frames[0].sy) * sc for fr in frames]
            dx = [(fr.sx - frames[0].sx) * sc for fr in frames]
            if o["lockBaseline"]:
                dy = dx = [0.0]
            other = sheets[key]["happy" if c == "idle" else "idle"][1]
            rows.append({
                "key": key, "clip": c, "blobs": info["big"], "tiny_bound": len(info["tiny_bound"]),
                "tiny_unbound": info["tiny_unbound"], "specks": info["specks_dropped"],
                "cut_px": info["cut_px"], "cut_solid_px": info["cut_solid_px"],
                "foot_y": [round(min(dy), 1), round(max(dy), 1)], "foot_x": [round(min(dx), 1), round(max(dx), 1)],
                "pair_scale": o["pairScale"], "med_h": info["med_h"], "med_w": info["med_w"],
                "ratio_h": round(info["med_h"] / other["med_h"], 4), "ratio_w": round(info["med_w"] / other["med_w"], 4),
                "seam": round(seam_ratio(cells), 2), "pingPong": bool(o["pingPong"]),
                "kb": round(out.stat().st_size / 1024), "webp_ok": ok, "ext": list(ext[key][c]),
                "margin": [axc + shift[key] - keyLR[key][0], cell - axc - shift[key] - keyLR[key][1], yc - ext[key][c][2], cell - yc - ext[key][c][3]],
                "split_sec": info.get("split_sec"),
            })
        fit = static_fit(key, cells_by["idle"][0], cell)
        if fit:
            sprite_entry["staticFit"] = fit
        manifest["sprites"][key] = sprite_entry
        if not args.manifest_only:
            overlay_image(key, cells_by["idle"][0], cells_by["happy"][0], cell, QC_DIR / "overlay" / f"{key}.png")
        print(f"ok   {key}", flush=True)

    manifest["sprites"] = dict(sorted(manifest["sprites"].items()))
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if not args.manifest_only:
        write_report(rows, failures, plan, args, sheets)
    return 0


def write_report(rows, failures, plan, args, sheets):
    L = [f"# Sprite QC report (quality={args.quality}, out-scale={args.out_scale})", ""]
    if plan:
        L += ["```", plan, "```", ""]
    total = sum(r["kb"] for r in rows)
    L.append(f"WebP {len(rows)} ไฟล์ รวม {total / 1024:.1f} MB · ใหญ่สุด {max((r['kb'] for r in rows), default=0)} KB")
    L.append("")
    if failures:
        L += ["## FAIL", ""] + [f"- {k}: {m}" for k, m in failures] + [""]
    L += ["| sheet | ก้อน | ชิ้นลอย ผูก/ไม่ได้ | glow ที่ยังตัด px (ทั้งหมด/ทึบ) | เท้า y (min..max) | เท้า x | เหลือขอบ L/R/T/B px | pairScale | สูง median Idle÷Happy | กว้าง median Idle÷Happy | seam | KB | ok |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        seam = f"{r['seam']}" + (" pingPong" if r["pingPong"] else (" ⚠ pingPong?" if r["seam"] > SEAM_LIMIT else ""))
        ratio = r["ratio_h"] if r["clip"] == "idle" else round(1 / r["ratio_h"], 4)
        ratio_w = r["ratio_w"] if r["clip"] == "idle" else round(1 / r["ratio_w"], 4)
        L.append(f"| {r['key']}_{r['clip']} | {r['blobs']} | {r['tiny_bound']}/{len(r['tiny_unbound'])} "
                 f"| {r['cut_px']}/{r['cut_solid_px']} | {r['foot_y'][0]}..{r['foot_y'][1]} | {r['foot_x'][0]}..{r['foot_x'][1]} "
                 f"| {'/'.join(str(v) for v in r['margin'])} | {r['pair_scale']} | {ratio} | {ratio_w} | {seam} | {r['kb']} | {'Y' if r['webp_ok'] else 'N'} |")
    unb = [(r, u) for r in rows for u in r["tiny_unbound"]]
    if unb:
        L += ["", "## ชิ้นลอยที่ผูกไม่ได้", ""] + [f"- {r['key']}_{r['clip']}: {u['px']}px ที่ {u['at']} ห่าง {u['dist']}px" for r, u in unb]
    L += ["", "หมายเหตุ: key ที่มีเอฟเฟกต์รอบตัวเยอะ (เมฆ/ประกาย/สายฟ้า เช่น egg5_*) ค่า median สูง/กว้างใช้ตัดสิน pairScale ไม่ได้ "
          "เพราะเอฟเฟกต์ของ Happy จัดวางต่างจาก Idle ต้องดูจาก overlay (หัว/ลำตัว/ขา) ประกอบเสมอ"]
    L += ["", "ภาพ: `contact/` (พื้นชมพู) `contact_black/` (พื้นดำ) `{key}_{clip}.png` · `overlay/{key}.png` "
          "(Idle f0 | Happy f0 | รูปนิ่ง | เส้นขอบซ้อน แดง=Idle น้ำเงิน=Happy เขียว=รูปนิ่ง)", ""]
    QC_DIR.mkdir(parents=True, exist_ok=True)
    (QC_DIR / "report.md").write_text("\n".join(L), encoding="utf-8")
    med = {k: {c: {"h": sheets[k][c][1]["med_h"], "w": sheets[k][c][1]["med_w"]} for c in sheets[k]} for k in sheets}
    (QC_DIR / "report.json").write_text(json.dumps({"rows": rows, "failures": failures, "medians": med}, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
