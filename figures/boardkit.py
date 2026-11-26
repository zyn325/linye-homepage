"""光路棋示意图绘制工具。

所有坐标、尺寸都以「最终输出像素」为单位书写（cell = 96px），
内部按 supersample 倍放大绘制，最后用 LANCZOS 缩小，保证线条平滑。
棋盘坐标 (x, y) 取 1..N，x 自左向右，y 自下而上。
"""

import math

from PIL import Image, ImageDraw, ImageFont

# ---------- 配色 ----------
RED = (192, 57, 43)
BLUE = (37, 84, 156)
RED_TINT = (252, 235, 232)
BLUE_TINT = (231, 237, 249)
GRID = (186, 186, 186)
FORBID_TINT = (246, 246, 246)
FORBID_LINE = (150, 150, 150)
FORBID_EDGE = (110, 110, 110)
BORDER = (110, 110, 110)
INK = (40, 40, 40)
GRAY = (120, 120, 120)
WALL = (36, 36, 36)
PAPER = (255, 255, 255)

_FONT_R = [
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
    ("/System/Library/Fonts/STHeiti Light.ttc", 0),
    ("/System/Library/Fonts/Supplemental/Songti.ttc", 0),
]
_FONT_B = [
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 1),
    ("/System/Library/Fonts/STHeiti Medium.ttc", 0),
    ("/System/Library/Fonts/Supplemental/Songti.ttc", 1),
]


def load_font(size_px, bold=False):
    for path, idx in (_FONT_B if bold else _FONT_R):
        try:
            return ImageFont.truetype(path, int(size_px), index=idx)
        except OSError:
            continue
    return ImageFont.load_default()


class Board:
    def __init__(self, n=13, cell=96, s=3, legend_h=0, pad=(108, 46, 88), axis_h=64):
        self.n, self.cell, self.s = n, cell, s
        self.pad_l, self.pad_t, self.pad_r = pad
        self.axis_h, self.legend_h = axis_h, legend_h
        self.W = self.pad_l + n * cell + self.pad_r
        self.H = self.pad_t + n * cell + self.axis_h + legend_h
        self.img = Image.new("RGB", (self.W * s, self.H * s), PAPER)
        self.d = ImageDraw.Draw(self.img)

    # ---------- 坐标换算 ----------
    def sc(self, v):
        return v * self.s

    def _box(self, x, y):
        x0 = self.pad_l + (x - 1) * self.cell
        y0 = self.pad_t + (self.n - y) * self.cell
        return x0, y0, x0 + self.cell, y0 + self.cell

    def center(self, x, y):
        x0, y0, x1, y1 = self._box(x, y)
        return (x0 + x1) / 2, (y0 + y1) / 2

    @property
    def board_box(self):
        return (self.pad_l, self.pad_t,
                self.pad_l + self.n * self.cell,
                self.pad_t + self.n * self.cell)

    # ---------- 基础图元（final 坐标 -> 自动放大） ----------
    def line(self, p0, p1, fill=INK, width=1.5, joint="curve"):
        self.d.line([self.sc(p0[0]), self.sc(p0[1]), self.sc(p1[0]), self.sc(p1[1])],
                    fill=fill, width=max(1, int(round(width * self.s))), joint=joint)

    def rect(self, box, fill=None, outline=None, width=1.5):
        self.d.rectangle([self.sc(v) for v in box], fill=fill, outline=outline,
                         width=max(1, int(round(width * self.s))))

    def ellipse(self, box, fill=None, outline=None, width=1.5):
        self.d.ellipse([self.sc(v) for v in box], fill=fill, outline=outline,
                       width=max(1, int(round(width * self.s))))

    def polygon(self, pts, fill=None, outline=None, width=1.0):
        self.d.polygon([(self.sc(p[0]), self.sc(p[1])) for p in pts], fill=fill,
                       outline=outline, width=max(1, int(round(width * self.s))))

    def text(self, xy, s, size=22, bold=False, fill=INK, anchor="mm"):
        self.d.text((self.sc(xy[0]), self.sc(xy[1])), s, font=load_font(size * self.s, bold),
                    fill=fill, anchor=anchor)

    def text_width(self, s, size=22, bold=False):
        f = load_font(size * self.s, bold)
        return self.d.textlength(s, font=f) / self.s

    def dashed_rect(self, box, color, width=1.6, dash=9, gap=6):
        x0, y0, x1, y1 = box
        for a, b in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)),
                     ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
            self._dashed(a, b, color, width, dash, gap)

    def _dashed(self, a, b, color, width, dash, gap):
        (ax, ay), (bx, by) = a, b
        length = ((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5
        ux, uy = (bx - ax) / length, (by - ay) / length
        t = 0.0
        while t < length:
            t2 = min(t + dash, length)
            self.line((ax + ux * t, ay + uy * t), (ax + ux * t2, ay + uy * t2),
                      fill=color, width=width)
            t += dash + gap

    def hatch(self, box, color, spacing=16, width=1.3):
        """45 度斜线填充，按 box 裁剪。"""
        x0, y0, x1, y1 = box
        c = x0 + y0
        while c <= x1 + y1:
            lo = max(x0, c - y1)
            hi = min(x1, c - y0)
            if hi - lo > 0.5:
                self.line((lo, c - lo), (hi, c - hi), fill=color, width=width)
            c += spacing

    # ---------- 棋盘元素 ----------
    def grid(self, labels=True):
        x0, y0, x1, y1 = self.board_box
        for i in range(self.n + 1):
            v = self.pad_l + i * self.cell
            self.line((v, y0), (v, y1), fill=GRID, width=2.2)
            h = self.pad_t + i * self.cell
            self.line((x0, h), (x1, h), fill=GRID, width=2.2)
        self.rect(self.board_box, outline=BORDER, width=3.0)
        if labels:
            self.axis_labels()

    def axis_labels(self):
        _, _, _, y1 = self.board_box
        for i in range(self.n):
            cx = self.pad_l + (i + 0.5) * self.cell
            self.text((cx, y1 + 28), str(i + 1), size=34, fill=INK)
            cy = y1 - (i + 0.5) * self.cell
            self.text((self.pad_l - 22, cy), str(i + 1), size=28, fill=INK, anchor="rm")
        # 轴名
        self.text((self.pad_l + self.n * self.cell + 20, y1 + 28), "x →", size=26,
                  fill=GRAY, anchor="lm")
        self.text((self.pad_l - 22, self.pad_t - 24), "↑ y", size=24, fill=GRAY, anchor="rm")

    def source(self, x, y, color):
        x0, y0, x1, y1 = self._box(x, y)
        self.rect((x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5), fill=color)
        cx, cy = self.center(x, y)
        r = self.cell
        # 白色光环 + 射线（光点符号）
        self.ellipse((cx - 0.15 * r, cy - 0.15 * r, cx + 0.15 * r, cy + 0.15 * r), fill=PAPER)
        self.ellipse((cx - 0.10 * r, cy - 0.10 * r, cx + 0.10 * r, cy + 0.10 * r), fill=color)
        for k in range(8):
            a = math.radians(k * 45)
            self.line((cx + math.cos(a) * 0.245 * r, cy + math.sin(a) * 0.245 * r),
                      (cx + math.cos(a) * 0.375 * r, cy + math.sin(a) * 0.375 * r),
                      fill=PAPER, width=0.065 * r)

    def walls(self, x, y, sides):
        """在格子边上画保护墙。sides 取 'top'/'bottom'/'left'/'right'（几何方向）。"""
        x0, y0, x1, y1 = self._box(x, y)
        t = 0.105 * self.cell
        h = t / 2
        if "left" in sides:
            self.rect((x0 - h, y0, x0 + h, y1), fill=WALL)
        if "right" in sides:
            self.rect((x1 - h, y0, x1 + h, y1), fill=WALL)
        if "top" in sides:      # 几何上方 = 屏幕较小 y
            self.rect((x0, y0 - h, x1, y0 + h), fill=WALL)
        if "bottom" in sides:   # 几何下方 = 屏幕较大 y
            self.rect((x0, y1 - h, x1, y1 + h), fill=WALL)
        for a, b, px, py in (("right", "bottom", x1, y1), ("right", "top", x1, y0),
                             ("left", "bottom", x0, y1), ("left", "top", x0, y0)):
            if a in sides and b in sides:
                self.rect((px - h, py - h, px + h, py + h), fill=WALL)

    def forbidden(self, x, y):
        """禁放格：中性样式，不区分红蓝。"""
        x0, y0, x1, y1 = self._box(x, y)
        box = (x0 + 1, y0 + 1, x1 - 1, y1 - 1)
        self.rect(box, fill=FORBID_TINT)
        self.hatch(box, color=FORBID_LINE)
        self.dashed_rect(box, color=FORBID_EDGE, width=1.5, dash=8, gap=5)

    def mirror(self, x, y, orientation, color, width=0.09, style="double", dashed=False):
        """orientation: '/' 或 '\\'，在格心画 45 度镜面；dashed=True 表示判定时取透射。"""
        x0, y0, x1, y1 = self._box(x, y)
        m = 0.16 * self.cell
        if orientation == "/":
            p0, p1 = (x0 + m, y1 - m), (x1 - m, y0 + m)
        else:
            p0, p1 = (x0 + m, y0 + m), (x1 - m, y1 - m)
        if dashed:
            self._dashed(p0, p1, color, width * self.cell, 7, 5)
            return
        if style == "double":
            self.line(p0, p1, fill=PAPER, width=width * self.cell + 4)
        self.line(p0, p1, fill=color, width=width * self.cell, joint="curve")
        self.line(p0, p1, fill=_mix(color, PAPER, 0.35), width=width * self.cell * 0.32)

    # ---------- 光路 ----------
    def polyline(self, pts, fill, width, joint="curve"):
        flat = []
        for p in pts:
            flat += [self.sc(p[0]), self.sc(p[1])]
        self.d.line(flat, fill=fill, width=max(1, int(round(width * self.s))), joint=joint)

    def arrowhead(self, tip, direction, size, fill):
        dx, dy = direction
        L = math.hypot(dx, dy) or 1.0
        dx, dy = dx / L, dy / L
        px, py = -dy, dx
        base = (tip[0] - dx * size, tip[1] - dy * size)
        self.polygon([(tip[0], tip[1]),
                      (base[0] + px * size * 0.52, base[1] + py * size * 0.52),
                      (base[0] - px * size * 0.52, base[1] - py * size * 0.52)], fill=fill)

    def beam(self, pts, color, width=4.6, halo=4.2, arrow=12.0):
        """带光晕和方向箭头的折线光路；转折处不加箭头，线段中点加。"""
        self.polyline(pts, PAPER, width + halo)
        self.polyline(pts, color, width)
        for i in range(1, len(pts)):
            p0, p1 = pts[i - 1], pts[i]
            vx, vy = p1[0] - p0[0], p1[1] - p0[1]
            L = math.hypot(vx, vy) or 1.0
            if i == len(pts) - 1:
                self.arrowhead(p1, (vx, vy), arrow, color)
            else:
                self.arrowhead((p0[0] + vx * 0.55, p0[1] + vy * 0.55), (vx, vy), arrow, color)

    # ---------- 图例 ----------
    def legend(self, items, y=None, size=26):
        x0, _, x1, y1 = self.board_box
        y = y if y is not None else y1 + self.axis_h + 46
        gap = 40
        widths = [36 + self.text_width(t, size) for _, t in items]
        total = sum(widths) + gap * (len(items) - 1)
        x = (self.W - total) / 2 + 6
        for (kind, label), w in zip(items, widths):
            self._swatch(kind, x, y)
            self.text((x + 34, y), label, size=size, anchor="lm", fill=INK)
            x += w + gap

    def _swatch(self, kind, x, y):
        s = 24
        if kind in ("red", "blue"):
            color = RED if kind == "red" else BLUE
            self.rect((x, y - s / 2, x + s, y + s / 2), fill=color)
        elif kind == "wall":
            self.line((x, y), (x + s, y), fill=WALL, width=0.42 * s)
        elif kind == "mirror":
            self.line((x + 1, y + s / 2 - 1), (x + s - 1, y - s / 2 + 1), fill=RED, width=5.5)
            self.line((x + 1, y + s / 2 - 1), (x + s - 1, y - s / 2 + 1), fill=PAPER, width=1.6)
        elif kind == "beam":
            self.line((x - 2, y), (x + s + 2, y), fill=RED, width=4.2)
            self.arrowhead((x + s + 6, y), (1, 0), 9, RED)
        elif kind == "forbid":
            self.rect((x, y - s / 2, x + s, y + s / 2), fill=FORBID_TINT)
            self.dashed_rect((x, y - s / 2, x + s, y + s / 2), FORBID_EDGE, 1.4, 5, 4)
            self.hatch((x, y - s / 2, x + s, y + s / 2), FORBID_LINE, 7, 1.0)

    # ---------- 输出 ----------
    def save(self, path):
        self.img.resize((self.W, self.H), Image.LANCZOS).save(path)
        return path


def _mix(c1, c2, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))
