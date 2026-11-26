"""生成《光路棋 游戏说明》正文（保留原文件的页面设置与样式表）。"""

import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

TITLE = "光路棋 游戏说明"

BLOCKS = [
    ("h", "一、游戏概述"),
    ("p", "光路棋是供两名玩家对局的棋类游戏。棋盘上双方各有一处光源，两人轮流放置属于自己阵营的镜子，"
          "用镜面把光折向对手，谁先搭成一条从己方光源出发、击中对手光源的光路（下称“击败光路”），谁就获胜。"
          "为己方搭路的同时，也可能顺手替对手打开一条路，因此每一手都要兼顾攻守。"),

    ("h", "二、棋盘与光源"),
    ("fig", "figures/fig1_board_marked.png", "图 1　棋盘、光源、保护墙与禁放格", 10.6),
    ("p", "对局在 13×13 的正方形棋盘上进行。棋盘坐标记为 (x, y)：x 自左向右、y 自下而上，取值范围都是 1～13。"),
    ("p", "红方光源位于 (5, 9)，蓝方光源位于 (9, 5)，光源所占的格子称为光源格。"),
    ("p", "每个光源格朝向对手光源的两条边上装有保护墙（红方为右、下两边，蓝方为左、上两边）。"
          "保护墙既不透光也不反光，光撞上即被吸收，所以光只能从光源格没有保护墙的另外两个方向进出。"),
    ("p", "与光源格两个开放方向紧邻的格子——红方 (4, 9)、(5, 10)，蓝方 (10, 5)、(9, 4)——称为禁放格。"
          "这四格对双方同样生效，任何时候都不能在其中放置镜子；光源格本身同样不能放镜。"),

    ("h", "三、回合与放置"),
    ("p", "（1）红方先行，双方轮流行动。（2）轮到自己时，必须放置一面自己颜色的镜子，不能跳过。"),
    ("p", "（3）镜子都是 45 度斜置的平面镜。放入棋盘时由玩家指定朝向，有“/”与“\\”两种放法；"
          "光被镜面折转的规律见第四节。"),
    ("p", "（4）每个格子最多放一面镜子；不能放在光源格、禁放格或已有镜子的格子上，也不能放到棋盘之外。"
          "（5）镜子落定后不能移动、不能改变朝向，也不能改换阵营。"),

    ("h", "四、光的传播与击败光路"),
    ("p", "胜负只取决于一件事：一方的光能否走到对方的光源。判定时不必真的发射光，只需检查“是否存在一条走得通的路径”。"
          "传播规则如下："),
    ("p", "（1）光从己方光源出发。光源没有保护墙的两个方向都可以出光，由本方在判定时选择其中一个作为起点方向即可，"
          "不需要两个方向同时发光。"),
    ("p", "（2）光沿棋盘的行、列方向前进，经过空格时不偏折。"),
    ("p", "（3）遇到对手阵营的镜子，必须反射；遇到自己阵营的镜子，可以反射，也可以透射（光直接穿过镜子，方向不变）。"
          "选反射还是透射由本方在判定时临时决定，无须事先声明，也不必对所有镜子采用同一种处理。"),
    ("p", "（4）反射按镜面反射计算，45 度斜置的镜子总把光折转 90 度：以“/”镜为例，向上的光折向右、向右的光折向上，"
          "向下的光折向左、向左的光折向下；“\\”镜则相反，向上的光折向左、向左的光折向上，向下的光折向右、向右的光折向下（见图 2）。"),
    ("fig", "figures/fig2_mirrors.png", "图 2　两种镜面朝向的折光方向", 12.0),
    ("p", "（5）光撞到棋盘边界、保护墙，或者折回己方光源格，即被吸收，这条光路就此终止。"),
    ("p", "（6）若光在两面镜子之间来回折返、绕成闭环，再也走不到新的方向，这条路径同样不成立；"
          "换一种走法即可——在自己的镜子上改选反射或透射，或者换一个起点方向。"),
    ("p", "（7）光从没有保护墙的一侧进入对手的光源格，就算是击中对手光源，这条路径就是击败光路。"),

    ("h", "五、胜负判定"),
    ("p", "每方落下一面镜子后，立即按下列顺序判定一次。"),
    ("p", "（1）对手是否已经拥有击败光路？若是，对手立即获胜。注意：即使你这一手同时也为自己搭好了击败光路，"
          "仍然判对手获胜——落子时替对手开路，等同于认负。"),
    ("p", "（2）对手没有击败光路，而自己有，则自己获胜。"),
    ("p", "（3）双方都没有击败光路，则轮到对手行棋。对局中任意一方都可以提出平局，对方同意即为平局；"
          "棋盘已经下满，或对局长期僵持、双方都无法推进时，也判为平局。"),

    ("h", "六、示例"),
    ("fig", "figures/fig3_path.png", "图 3　红方的一条击败光路（虚线镜取透射，蓝方无法反向通过）", 9.6),
    ("p", "图 3 中红方已经搭成击败光路。蓝方光源的左侧和上侧有保护墙，光只能从右侧或下方进入 (9, 5)，"
          "红方因此绕到棋盘上方：从 (5, 9) 向上，在 (5, 11) 穿过自己的镜子（取透射），(5, 13) 被“/”镜折向右，"
          "(12, 13) 被“\\”镜折向下，(12, 5) 被“/”镜折向左，从右侧进入蓝方光源格。"),
    ("p", "这条路只对红方成立。只用反射搭出的路一定双向，反过来走对手也通；红方在 (5, 11) 取透射，自己的光直接穿过，"
          "蓝方的光却必须反射，原路返回就走不通——蓝方那三面镜子正想从上方绕进第 5 列，也被挡在这里。"),

]

SONG = "宋体"


def _set_font(run, size, bold=False, color=None):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.name = SONG
    run._element.rPr.rFonts.set(qn("w:eastAsia"), SONG)
    if color is not None:
        run.font.color.rgb = color


def build(path):
    d = Document(path)
    body = d.element.body
    sectPr = body.find(qn("w:sectPr"))
    assert sectPr is not None, "缺少节属性，停止以免丢失页面设置"
    for child in list(body):
        if child is not sectPr:
            body.remove(child)

    for block in BLOCKS:
        kind = block[0]
        if kind == "h":
            p = d.add_paragraph()
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.keep_with_next = True
            if len(block) > 2 and block[2] == "newpage":
                p.paragraph_format.page_break_before = True
            _set_font(p.add_run(block[1]), 12, bold=True)
        elif kind == "p":
            p = d.add_paragraph()
            p.paragraph_format.first_line_indent = Pt(21)
            p.paragraph_format.line_spacing = 1.26
            p.paragraph_format.widow_control = True
            p.paragraph_format.space_after = Pt(0)
            _set_font(p.add_run(block[1]), 10.5)
        elif kind == "li":
            p = d.add_paragraph()
            p.paragraph_format.left_indent = Pt(21)
            p.paragraph_format.first_line_indent = Pt(-10.5)
            p.paragraph_format.line_spacing = 1.26
            p.paragraph_format.space_after = Pt(0)
            _set_font(p.add_run("· " + block[1]), 10.5)
        elif kind == "fig":
            _, png, caption, width = block
            p = d.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(4)
            p.add_run().add_picture(png, width=Cm(width))
            cap = d.add_paragraph()
            cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
            cap.paragraph_format.space_after = Pt(8)
            _set_font(cap.add_run(caption), 9, color=RGBColor(0x59, 0x59, 0x59))

    title = d.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_after = Pt(12)
    _set_font(title.add_run(TITLE), 16)
    body.remove(title._p)
    body.insert(0, title._p)

    d.save(path)
    return path


if __name__ == "__main__":
    print(build(sys.argv[1] if len(sys.argv) > 1 else "../光路棋 游戏说明.docx"))
