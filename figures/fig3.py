"""图 3：红方的一条单向击败光路（含双方镜子）。"""

from boardkit import Board, RED, BLUE

RED_SRC = (5, 9)
BLUE_SRC = (9, 5)
FORBID = ((4, 9), (5, 10), (10, 5), (9, 4))

RED_MIRRORS = {           # (x, y): (朝向, 是否取透射)
    (5, 11): ("\\", True),   # 红方在这里取透射：自己穿过，蓝方必须反射
    (5, 13): ("/", False),
    (12, 13): ("\\", False),
    (12, 5): ("/", False),
}
BLUE_MIRRORS = {
    (9, 3): "/",     # 蓝方想从下方绕到左边
    (6, 3): "\\",
    (6, 11): "\\",
}


def build(out):
    b = Board(n=13, cell=96, s=3, legend_h=0)

    for x, y in FORBID:
        b.forbidden(x, y)

    b.grid()

    # 先画光路，再把光源、保护墙、镜子压在光路上，避免镜面被光晕吃掉
    pts = [b.center(5, 9), b.center(5, 13), b.center(12, 13), b.center(12, 5), b.center(9, 5)]
    b.beam(pts, RED, width=5.2, halo=4.6, arrow=13)

    b.source(*RED_SRC, RED)
    b.source(*BLUE_SRC, BLUE)
    b.walls(*RED_SRC, ("right", "bottom"))
    b.walls(*BLUE_SRC, ("left", "top"))
    for (x, y), o in BLUE_MIRRORS.items():
        b.mirror(x, y, o, BLUE)
    for (x, y), (o, dashed) in RED_MIRRORS.items():
        b.mirror(x, y, o, RED, dashed=dashed)

    x0, y0, x1, y1 = b._box(*BLUE_SRC)
    b.dashed_rect((x0 - 6, y0 - 6, x1 + 6, y1 + 6), RED, width=2.2, dash=9, gap=6)

    b.save(out)
    print("saved", out)


if __name__ == "__main__":
    build("fig3_path.png")
