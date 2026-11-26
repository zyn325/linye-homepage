"""把生成的 PNG 作为插图放进 docx，并自动替换同一锚点前的旧图与旧图注。"""

import re

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

CAPTION_RE = re.compile(r"^图\s*\d+\s")


def _has_picture(p):
    return bool(p._p.findall(".//" + qn("a:blip")))


def _prev(paragraph):
    el = paragraph._p.getprevious()
    while el is not None and el.tag != qn("w:p"):
        el = el.getprevious()
    if el is None:
        return None
    from docx.text.paragraph import Paragraph
    return Paragraph(el, paragraph._parent)


def set_figure(docx_path, anchor_contains, png, caption, width_cm):
    d = Document(docx_path)
    anchor = next((p for p in d.paragraphs if anchor_contains in p.text), None)
    assert anchor is not None, f"找不到锚点：{anchor_contains}"

    # 清掉已有的旧图 / 旧图注
    p = _prev(anchor)
    while p is not None and (_has_picture(p) or CAPTION_RE.match(p.text or "")):
        nxt = _prev(p)
        p._p.getparent().remove(p._p)
        p = nxt

    pic_p = anchor.insert_paragraph_before()
    pic_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pic_p.paragraph_format.space_before = Pt(8)
    pic_p.paragraph_format.space_after = Pt(4)
    pic_p.add_run().add_picture(png, width=Cm(width_cm))

    cap = anchor.insert_paragraph_before()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(14)
    r = cap.add_run(caption)
    r.font.size = Pt(9)
    r.font.name = "宋体"
    r.font.color.rgb = RGBColor(0x59, 0x59, 0x59)
    r._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")

    d.save(docx_path)
    return caption
