"""图 2：两种镜面朝向的折光方向。"""

import math

from PIL import Image, ImageDraw

from boardkit import INK, PAPER, load_font

S = 3
C = 140          # 单格边长
GAP = 78
EXT = 24         # 光束伸出格外的长度
M = 40
HEAD = 62        # 标题区高度

BEAM = (52, 52, 52)


def _arrow(d, tip, vec, size=14):
    vx, vy = vec
    L = math.hypot(vx, vy) or 1
    vx, vy = vx / L, vy / L
    nx, ny = -vy, vx
    base = (tip[0] - vx * size, tip[1] - vy * size)
    d.polygon([(tip[0] * S, tip[1] * S),
               ((base[0] + nx * size * 0.55) * S, (base[1] + ny * size * 0.55) * S),
               ((base[0] - nx * size * 0.55) * S, (base[1] - ny * size * 0.55) * S)],
              fill=BEAM)


def panel(d, ox, oy, orient, kind, mapping):
    x0, y0, x1, y1 = ox, oy, ox + C, oy + C
    cx, cy = ox + C / 2, oy + C / 2

    d.rectangle([x0 * S, y0 * S, x1 * S, y1 * S], fill=PAPER,
                outline=(160, 160, 160), width=int(1.3 * S))

    if orient == "/":
        p0, p1 = (x0 + 0.13 * C, y1 - 0.13 * C), (x1 - 0.13 * C, y0 + 0.13 * C)
    else:
        p0, p1 = (x0 + 0.13 * C, y0 + 0.13 * C), (x1 - 0.13 * C, y1 - 0.13 * C)
    w = 0.075 * C
    d.line([p0[0] * S, p0[1] * S, p1[0] * S, p1[1] * S], fill=INK, width=int(w * S))
    d.line([p0[0] * S, p0[1] * S, p1[0] * S, p1[1] * S], fill=(255, 255, 255),
           width=max(1, int(w * 0.30 * S)))

    o = 0.24 * C
    if orient == "/" and kind == "up":
        hit = (cx - o, y1 - (C / 2 - o))
        pts = [(cx - o, y1 + EXT), hit, (x1 + EXT, hit[1])]
    elif orient == "/" and kind == "down":
        hit = (cx + o, cy - o)
        pts = [(cx + o, y0 - EXT), hit, (x0 - EXT, hit[1])]
    elif orient == "\\" and kind == "up":
        hit = (cx + o, cy + o)
        pts = [(cx + o, y1 + EXT), hit, (x0 - EXT, hit[1])]
    else:
        hit = (cx - o, cy - o)
        pts = [(cx - o, y0 - EXT), hit, (x1 + EXT, hit[1])]

    flat = [v * S for p in pts for v in p]
    d.line(flat, fill=PAPER, width=int(6.2 * S), joint="curve")
    d.line(flat, fill=BEAM, width=int(4.0 * S), joint="curve")
    _arrow(d, pts[-1], (pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1]))
    # 入射段中部再加一个箭头，标明光的前进方向
    a, b = pts[0], pts[1]
    _arrow(d, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), (b[0] - a[0], b[1] - a[1]))

    f = load_font(21 * S)
    l1 = f"“{orient}” 镜"
    l2 = mapping
    for i, line in enumerate((l1, l2)):
        tw = d.textlength(line, font=f) / S
        d.text(((ox + C / 2 - tw / 2) * S, (oy + C + EXT + 20 + i * 26) * S), line, font=f, fill=INK)


def build(out):
    panels = [("/", "up", "上 → 右"), ("/", "down", "下 → 左"),
              ("\\", "up", "上 → 左"), ("\\", "down", "下 → 右")]
    W = M * 2 + 4 * C + 3 * GAP
    H = M + C + EXT + HEAD + 14
    img = Image.new("RGB", (W * S, H * S), PAPER)
    d = ImageDraw.Draw(img)
    for i, (orient, kind, mapping) in enumerate(panels):
        panel(d, M + i * (C + GAP), M, orient, kind, mapping)
    img.resize((W, H), Image.LANCZOS).save(out)
    print("saved", out, (W, H))


if __name__ == "__main__":
    build("fig2_mirrors.png")
