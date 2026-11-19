# -*- coding: utf-8 -*-
"""出沙井村舆图粗图。

    python tools/mapgen/gen_map.py --dry-run    # 只打印 prompt，不花钱
    python tools/mapgen/gen_map.py              # 出 4 张候选到 work/base_0..3.jpg
    python tools/mapgen/gen_map.py --pick 2     # 把 base_2 定为 base.jpg

H3-Image 没有 seed，同 prompt 重跑结果不同，所以：
  * 候选已存在就跳过，绝不重复烧钱；
  * 挑定之后 base.jpg 不再重生成。
"""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mmapi
import style

WORK = style.ROOT and os.path.join(os.path.dirname(os.path.abspath(__file__)), "work")
CANDIDATES = 4


def main():
    argv = sys.argv[1:]
    if "--dry-run" in argv:
        print("=== 出图 prompt ===")
        print(style.MAP_PROMPT)
        print("\n=== 尺寸 ===")
        print("粗图 %s  →  每格 %dx%d  →  瓦片 %s  →  世界 %dx%d  →  总览 %s"
              % (style.BASE_SIZE, style.CELL_W, style.CELL_H, style.TILE_SIZE,
                 style.WORLD_W, style.WORLD_H, style.OVERVIEW_SIZE))
        return

    if "--pick" in argv:
        n = int(argv[argv.index("--pick") + 1])
        src = os.path.join(WORK, "base_%d.jpg" % n)
        dst = os.path.join(WORK, "base.jpg")
        with open(src, "rb") as f:
            blob = f.read()
        with open(dst, "wb") as f:
            f.write(blob)
        print("已定稿：%s ← base_%d.jpg（%d 字节）" % (dst, n, len(blob)))
        return

    os.makedirs(WORK, exist_ok=True)
    todo = [i for i in range(CANDIDATES)
            if not os.path.exists(os.path.join(WORK, "base_%d.jpg" % i))]
    if not todo:
        print("候选已齐，跳过生成。要重来请先删 work/base_*.jpg")
    else:
        print("生成 %d 张候选（%s）…" % (len(todo), style.BASE_SIZE))
        imgs = mmapi.wait_retry(
            lambda: mmapi.generate(style.MAP_PROMPT, style.BASE_SIZE, n=len(todo)))
        for i, (blob, revised) in enumerate(imgs):
            p = os.path.join(WORK, "base_%d.jpg" % todo[i])
            mmapi.save(p, blob)
            print("  落盘 %s（%d 字节）" % (os.path.relpath(p, style.ROOT), len(blob)))
            if revised:
                with io.open(os.path.join(WORK, "base_%d.revised.txt" % todo[i]),
                             "w", encoding="utf-8") as f:
                    f.write(revised)
    print("\n下一步：看图挑一张，然后  python tools/mapgen/gen_map.py --pick N")


if __name__ == "__main__":
    main()
