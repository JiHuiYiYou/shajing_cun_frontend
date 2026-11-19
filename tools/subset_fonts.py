# -*- coding: utf-8 -*-
"""把思源宋体（Noto Serif SC）裁成本页实际用到的字，存为自托管 WOFF2。

    python tools/subset_fonts.py

要点
  * 字表从 html / css / js 三处源码里扫出来，取并集，data.js 里的史料原文也计入。
  * 用 --unicodes-file 传字表，避开 Windows 命令行长度上限（旧脚本因此漏字）。
  * 落盘后逐字核对：少一个字就报错退出，不留半吊子字体。

源字体 NotoSerifSC-{Regular,Bold}.otf 为 OFL 1.1，可自由裁切与再分发。
"""
import io
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get("NOTO_SRC", os.path.join(ROOT, "tools", "fontsrc"))
OUT = os.path.join(ROOT, "assets", "fonts")
WEIGHTS = (("Regular", "noto-serif-sc-400.woff2"), ("Bold", "noto-serif-sc-700.woff2"))
EXTS = (".html", ".css", ".js")


def source_files():
    """扫整个 assets 目录 + 根目录的 html。

    以前这里是写死四个文件的，加了 world.js / sites.js 就会漏字，
    页面出现豆腐块，而且只有跑本脚本的时候才发现。改成扫目录，一劳永逸。
    """
    files = []
    for p in (os.path.join(ROOT, "沙井村前端.html"),):
        if os.path.exists(p):
            files.append(p)
    for base, dirs, names in os.walk(os.path.join(ROOT, "assets")):
        dirs[:] = [d for d in dirs if d not in ("fonts",)]
        for n in names:
            if n.lower().endswith(EXTS):
                files.append(os.path.join(base, n))
    return sorted(files)


def collect_chars():
    chars = set(chr(c) for c in range(0x20, 0x7F))          # ASCII
    files = source_files()
    for p in files:
        with io.open(p, encoding="utf-8") as f:
            chars |= {c for c in f.read() if ord(c) > 31}
    # 界面里另有动态拼出的字，补进来
    chars |= set("〇一二三四五六七八九十百千万亿正腊月份初廿卅甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥上下中左右东南西北前后里外大小多少有无新旧本末")
    return sorted(chars), files


def main():
    from fontTools.ttLib import TTFont

    os.makedirs(OUT, exist_ok=True)
    chars, files = collect_chars()
    unis = ",".join("U+%04X" % ord(c) for c in chars)
    listfile = os.path.join(SRC, "_unis.txt")
    os.makedirs(SRC, exist_ok=True)
    with io.open(listfile, "w", encoding="utf-8") as f:
        f.write(unis)
    print("字表：%d 字（扫了 %d 个文件）" % (len(chars), len(files)))

    bad = False
    for weight, out in WEIGHTS:
        src = os.path.join(SRC, "NotoSerifSC-%s.otf" % weight)
        if not os.path.exists(src):
            print("缺少源字体：%s" % src)
            bad = True
            continue
        dst = os.path.join(OUT, out)
        cmd = [sys.executable, "-m", "fontTools.subset", src,
               "--output-file=" + dst,
               "--unicodes-file=" + listfile,
               "--flavor=woff2",
               "--layout-features=*",
               "--name-IDs=*",
               "--drop-tables+=DSIG",
               "--no-hinting",
               "--desubroutinize"]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
        cmap = TTFont(dst).getBestCmap()
        missing = [c for c in chars if ord(c) not in cmap]
        print("%-8s %7.1f KB  glyphs=%5d  缺字=%d %s" % (
            weight, os.path.getsize(dst) / 1024, len(cmap), len(missing), "".join(missing)[:60]))
        if missing:
            bad = True
    if bad:
        print("字体裁切未通过，勿发布。")
        sys.exit(1)
    print("字体裁切通过。")


if __name__ == "__main__":
    main()
