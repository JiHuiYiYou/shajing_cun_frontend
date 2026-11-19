# -*- coding: utf-8 -*-
"""抹掉图上的伪文字。

    python tools/mapgen/clean.py --check    # 只标出位置，不改图
    python tools/mapgen/clean.py            # 按 ARTIFACTS 清单处理 work/base.jpg

AI 生图爱在墙上、牌匾上写乱码汉字。这张舆图是正上方俯视的实景地图，
不能留题跋，但也不能为此重出整张图（没有 seed，重出就是重新赌一次）。

做法：框出伪文字所在的那块地，在这一小块内部做**墨色笔画修复**。
用归一化扩散（只拿「已知像素」当填充源，一圈圈往外推），
墨迹本身永远不会成为填充来源，所以不会留下鬼影。
只动笔画，不动围墙。
"""
import io
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")

# 伪文字所在区域（原图 3072x2040 坐标）：x, y, 宽, 高
# 每一块都是「围墙以内、写着假字的那片地」，四周留出余地不碰围墙。
ARTIFACTS = [
    (463, 592, 200, 155),      # 村西一处围墙院子里的伪字地
]

# 这些地方虽然暗，但不是伪字（是树、是笔画残根），不许动
PROTECT = [
    (432, 566, 80, 64),        # 院子角上那棵树
]

INK_LUMA = 168          # 低于此亮度算作笔画
MARGIN = 4              # 贴边的暗像素多半是围墙或影子，不动


def _boxsum(a, r):
    """2D 盒式求和（积分图），返回与 a 同形的窗口和。"""
    H, W = a.shape
    p = np.pad(a, r + 1, mode="edge")
    c = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    return c[k:k + H, k:k + W] - c[:H, k:k + W] - c[k:k + H, :W] + c[:H, :W]


def _fit_basis(h, w):
    """二次曲面基：1, x, y, x², y², xy（坐标归一到 [-1,1]）。"""
    yy, xx = np.mgrid[0:h, 0:w]
    xn = (xx / max(1, w - 1)) * 2 - 1
    yn = (yy / max(1, h - 1)) * 2 - 1
    return np.stack([np.ones_like(xn), xn, yn, xn * xn, yn * yn, xn * yn], axis=-1)


def inpaint_block(im, box, thr=INK_LUMA, border=10, margin=MARGIN):
    """在 box 内把暗笔画抹平。

    这块地不是纯色：靠墙根暗、场地心亮。所以不用中值也不用常数色，
    而是拿框内非笔画像素**拟一张二次曲面**当地色（能还原由暗到亮的过渡），
    再把笔画连抗锯齿边一起盖掉，最后轻微软化交界，不留硬边。
    """
    x, y, w, h = box
    reg = im.crop((x, y, x + w, y + h)).convert("RGB")
    a = np.asarray(reg).astype(np.float64)
    lum = a.mean(axis=2)

    mask = lum < thr
    mask[:margin, :] = False
    mask[-margin:, :] = False
    mask[:, :margin] = False
    mask[:, -margin:] = False
    # 保护区（树、笔画残根）里的暗像素不算伪字
    for px, py, pw, ph in PROTECT:
        ix0, iy0 = max(0, px - x), max(0, py - y)
        ix1, iy1 = min(w, px + pw - x), min(h, py + ph - y)
        if ix1 > ix0 and iy1 > iy0:
            mask[iy0:iy1, ix0:ix1] = False
    if not mask.any():
        return 0

    # 笔画连抗锯齿边一起算进去（膨胀两圈）
    m = mask.copy()
    for _ in range(2):
        d = m.copy()
        d[1:, :] |= m[:-1, :]
        d[:-1, :] |= m[1:, :]
        d[:, 1:] |= m[:, :-1]
        d[:, :-1] |= m[:, 1:]
        m = d

    # 地色：框内去掉边框一圈后，非笔画像素逐通道拟二次曲面
    inner = np.ones_like(m)
    inner[:border, :] = False
    inner[-border:, :] = False
    inner[:, :border] = False
    inner[:, -border:] = False
    known = inner & ~m
    if known.sum() < 120:
        known = ~m
    B = _fit_basis(h, w)
    bk = B[known]
    flat = np.empty_like(a)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(bk, a[:, :, c][known], rcond=None)
        flat[:, :, c] = B @ coef

    a[m] = flat[m]
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    # 只把填充区轻微柔化，免得和四周接缝生硬
    soft = out.filter(ImageFilter.GaussianBlur(1.1))
    mm = Image.fromarray((m * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(1.1))
    out = Image.composite(soft, out, mm)
    im.paste(out, (x, y))
    return int(m.sum())


def main():
    src = os.path.join(WORK, "base.jpg")
    dst = os.path.join(WORK, "base_clean.jpg")
    if not os.path.exists(src):
        print("没有 work/base.jpg，先跑 gen_map.py --pick N")
        return
    if "--check" in sys.argv:
        im = Image.open(src)
        for i, b in enumerate(ARTIFACTS):
            im.crop((b[0], b[1], b[0] + b[2], b[1] + b[3])).resize(
                (b[2] * 3, b[3] * 3), Image.LANCZOS).save(
                os.path.join(WORK, "_art_%d.jpg" % i), quality=94)
            print("artifact %d: %s" % (i, b))
        return

    im = Image.open(src).convert("RGB")
    for i, b in enumerate(ARTIFACTS):
        n = inpaint_block(im, b)
        print("artifact %d 修掉 %d 个墨像素" % (i, n))
    im.save(dst, quality=95)
    print("已写 %s" % dst)
    with io.open(os.path.join(WORK, "base.cleaned"), "w", encoding="utf-8") as f:
        f.write("1")


if __name__ == "__main__":
    main()
