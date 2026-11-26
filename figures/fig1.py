"""图 1：13×13 棋盘与双方光源、保护墙的初始布置。"""

from boardkit import (Board, RED, BLUE, RED_TINT, BLUE_TINT, GRAY)

RED_SRC = (5, 9)     # 红方光源
BLUE_SRC = (9, 5)    # 蓝方光源

# 保护墙：位于朝向对手光源的两条边上
RED_WALLS = ("right", "bottom")   # 对手在右下方
BLUE_WALLS = ("left", "top")      # 对手在左上方

# 光源两个开放方向的紧邻格，不可放镜（对双方同样生效）
FORBID = ((4, 9), (5, 10), (10, 5), (9, 4))


def build(marked: bool, out: str):
    b = Board(n=13, cell=96, s=3, legend_h=120)

    if marked:
        for x, y in FORBID:
            b.forbidden(x, y)

    b.grid()
    b.source(*RED_SRC, RED)
    b.source(*BLUE_SRC, BLUE)
    b.walls(*RED_SRC, RED_WALLS)
    b.walls(*BLUE_SRC, BLUE_WALLS)

    items = [("red", "红方光源"), ("blue", "蓝方光源"), ("wall", "保护墙")]
    if marked:
        items.append(("forbid", "禁放格（不可放镜）"))
    b.legend(items, y=b.H - 60, size=30)

    b.save(out)
    print("saved", out)


if __name__ == "__main__":
    build(False, "fig1_board.png")
    build(True, "fig1_board_marked.png")
