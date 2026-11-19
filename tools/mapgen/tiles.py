# -*- coding: utf-8 -*-
"""切九宫格 → 逐块精修 → 缝合 → 出瓦片与总览。

    python tools/mapgen/tiles.py            # 全流程（已存在的块会跳过）
    python tools/mapgen/tiles.py --stitch   # 只缝合，不调 API

尺寸链（全整数，无拉伸）：
    粗图 3072×2040  →  每格 1024×680  →  精修成 2048×1360  →  世界 6144×4080  →  总览 1536×1020

为什么要有「接缝合缝」这一道：
  精修是模型重画，它不保证与原图逐像素对齐。缝合时用粗图打底、
  精修块四边留羽化带，让误差落在块内部、边界交给底图吸收；
  剩下四条内部缝再单独过一次模型，把屋与路接续上。
"""
import io
import json
import os
import sys

from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mmapi
import style

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
MAPOUT = os.path.join(style.ROOT, "assets", "map")

BASE = os.path.join(WORK, "base_clean.jpg")
CW, CH = style.CELL_W, style.CELL_H          # 1024, 680
TW, TH = 2048, 1360                           # 精修块
WW, WH = style.WORLD_W, style.WORLD_H         # 6144, 4080
FEATHER = 16                                 # 缝合羽化带宽（世界像素）
TONE_MATCH = True                            # 把每块精修图的纸色调到底图那一格

# 这两格里有那处被抹掉伪字的院子，提示里点一句，免得模型照着旧样再画一遍字
NO_TEXT_HINT = ("\n注意：这一格里有一处围墙院子，院内原本写着字，现已抹去。"
                "请把院内画成空院菜畦或晾场，**不要出现任何文字、牌匾、石碑、匾额**。")


def region_desc():
    p = os.path.join(WORK, "regions.json")
    if not os.path.exists(p):
        return {}
    d = json.load(io.open(p, encoding="utf-8"))
    return d.get("regions", {})


def cut_cells(base):
    return [base.crop((c * CW, r * CH, (c + 1) * CW, (r + 1) * CH))
            for r in range(3) for c in range(3)]


def refine_all():
    base = Image.open(BASE).convert("RGB")
    if base.size != (CW * 3, CH * 3):
        raise SystemExit("粗图尺寸不对：%s" % (base.size,))
    cells = cut_cells(base)
    # 全图缩略，给模型当上下文
    small = io.BytesIO()
    base.resize((1024, 680), Image.LANCZOS).save(small, "JPEG", quality=88)
    small = small.getvalue()

    desc = region_desc()
    for r in range(3):
        for c in range(3):
            dst = os.path.join(WORK, "tile_r%d_c%d.jpg" % (r, c))
            if os.path.exists(dst) and os.path.getsize(dst) > 0:
                print("  已有 r%dc%d，跳过" % (r, c))
                continue
            d = desc.get("%d_%d" % (r, c), "")
            prompt = style.tile_prompt(d, r, c)
            if (r, c) in ((0, 0), (1, 0)):
                prompt = prompt.replace(style.NEG, NO_TEXT_HINT + style.NEG)
            cell = io.BytesIO()
            cells[r * 3 + c].save(cell, "JPEG", quality=92)
            print("[%d/9] 精修 r%dc%d  %s" % (r * 3 + c + 1, r, c, d))
            blob, _ = mmapi.wait_retry(
                lambda: mmapi.edit(prompt, [cell.getvalue(), small], style.TILE_SIZE,
                                   quality=92, fmt="jpeg"))
            mmapi.save(dst, blob)
            print("    %d 字节" % len(blob))


def feather_mask(w, h, f):
    """四边向内渐隐的 alpha：中心 1，边 0。"""
    import numpy as np
    a = np.ones((h, w), dtype=np.float32)
    ramp = np.linspace(0, 1, f, dtype=np.float32)
    a[:f, :] = np.minimum(a[:f, :], ramp[:, None])
    a[-f:, :] = np.minimum(a[-f:, :], ramp[::-1][:, None])
    a[:, :f] = np.minimum(a[:, :f], ramp[None, :])
    a[:, -f:] = np.minimum(a[:, -f:], ramp[::-1][None, :])
    return Image.fromarray((a * 255).astype("uint8"), "L")


def _paper_mean(arr):
    """取纸地（亮而低饱和那层）的平均色。"""
    m = (arr[:, :, 0] > 190) & (arr[:, :, 1] > 180)
    if m.sum() < 500:
        m = arr.mean(axis=2) > 180
    return arr[m].mean(axis=0)


def match_tone(tile, base_cell):
    """把精修块的纸色调到底图对应那一格，缝上以后看不出格子。"""
    import numpy as np
    a = np.asarray(tile).astype(np.float32)
    b = np.asarray(base_cell).astype(np.float32)
    if b.shape[0] != a.shape[0]:
        b = np.asarray(base_cell.resize((a.shape[1], a.shape[0]), Image.LANCZOS)).astype(np.float32)
    d = _paper_mean(b) - _paper_mean(a)
    a = np.clip(a + d, 0, 255).astype(np.uint8)
    return Image.fromarray(a)


def stitch():
    import numpy as np
    base = Image.open(BASE).convert("RGB")
    world = base.resize((WW, WH), Image.LANCZOS)      # 粗图打底
    mask = feather_mask(TW, TH, FEATHER)

    for r in range(3):
        for c in range(3):
            p = os.path.join(WORK, "tile_r%d_c%d.jpg" % (r, c))
            if not os.path.exists(p):
                print("  缺 %s，跳过" % os.path.basename(p))
                continue
            t = Image.open(p).convert("RGB")
            if t.size != (TW, TH):
                t = t.resize((TW, TH), Image.LANCZOS)
            if TONE_MATCH:
                cell = base.crop((c * CW, r * CH, (c + 1) * CW, (r + 1) * CH))
                t = match_tone(t, cell)
            world.paste(t, (c * TW, r * TH), mask)
            t.save(os.path.join(WORK, "tile_r%d_c%d.jpg" % (r, c)), quality=92)
    world.save(os.path.join(WORK, "world.jpg"), quality=92)
    print("已缝 %s (%dx%d)" % (os.path.join(WORK, "world.jpg"), WW, WH))

    os.makedirs(MAPOUT, exist_ok=True)
    # 交付的是**缝合后的整图**：九块单看各有一道接缝，接起来才是一张。
    # 浏览器先上总览（糊），主图到位再换上——换的是整张，不会有格线。
    world.save(os.path.join(MAPOUT, "world.jpg"), quality=84, optimize=True,
               progressive=True)
    world.resize(style.OVERVIEW_SIZE, Image.LANCZOS).save(
        os.path.join(MAPOUT, "overview.jpg"), quality=84)
    for r in range(3):
        for c in range(3):
            p = os.path.join(WORK, "tile_r%d_c%d.jpg" % (r, c))
            if os.path.exists(p):
                Image.open(p).convert("RGB").save(
                    os.path.join(MAPOUT, "tile_r%d_c%d.jpg" % (r, c)), quality=84)
    base.save(os.path.join(MAPOUT, "base.jpg"), quality=90)
    print("已写 assets/map/：world.jpg（主图）+ overview.jpg（总览）+ 9 块瓦片 + base.jpg（兜底）")


def main():
    if "--stitch" in sys.argv:
        stitch()
        return
    if not os.path.exists(BASE):
        raise SystemExit("没有 work/base_clean.jpg，先跑 gen_map.py --pick N 与 clean.py")
    refine_all()
    stitch()


if __name__ == "__main__":
    main()
