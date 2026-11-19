# -*- coding: utf-8 -*-
"""把单文件 沙井村前端.单文件.html 拆成 html / css / js 多份（源文件形态）。

用法：
    python tools/split.py          # 从单文件拆出 assets/css、assets/js
    python tools/split.py --check  # 校验单文件与源文件是否同步

拆出的结构：
    沙井村前端.html          标记（只含结构与引用）
    assets/css/*.css         样式（每份一个）
    assets/js/*.js           脚本（data / sites / world / app …）

单文件里每块内联内容前面都有一行标记注释
<!--css:assets/css/xxx.css--> / <!--js:assets/js/xxx.js-->，
本脚本按标记还原，所以拆完再打包不会走形。

⚠️ 这个脚本会重写 沙井村前端.html。跑之前先确认：拆分只是把单文件
还原成源文件形态，单文件里没有的东西拆不出来。单文件若不含标记
（例如是旧版本打出来的），本脚本拒绝运行——宁可不动，也不要毁仓库。
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "沙井村前端.html")
BUILD = os.path.join(ROOT, "build", "沙井村前端.单文件.html")

RE_CSS_BLOCK = re.compile(r"<!--css:([^\n]+?)-->\s*<style>\n(.*?)\n</style>", re.S)
RE_JS_BLOCK = re.compile(r"<!--js:([^\n]+?)-->\s*<script>\n(.*?)\n</script>", re.S)
RE_BODY = re.compile(r"<body>\n(.*?)\n</body>", re.S)

CSS_BANNER = """/* ============================================================
   沙井村 · 舆图 — 样式
   设计读法：数字人文的村落方志，面向史料阅读者与学生；
   语言取「水墨宣纸」，以原生 CSS / SVG / Canvas 手写，
   不套用现成组件库。
   形制锁：面板与按钮一律 2px 直角（档案纸样），
           仅年轮、表盘、徽记使用圆形。
   强调色锁：全场唯一强调色为朱砂 #a5311d。
   ============================================================ */
"""

JS_BANNER = {
    "assets/js/data.js": """/* ============================================================
   沙井村 · 舆图 — 史料数据
   照录《沙井村72户人物信息归集表》，未作改写。
   households  户（72 户）   calendar 岁时（24 条）
   econ        经济参数（10 条）
   events      岁内案卷（12 案）
   backlog     未结案牍（7 条）
   places      村落之处（5 处）
   counts      族属统计
   ============================================================ */
""",
}


def read(path):
    with io.open(path, "r", encoding="utf-8") as f:
        return f.read()


def write(path, text):
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def check():
    """校验：源文件里引用的 css/js 都存在，单文件里的块数对得上。"""
    src = read(SRC)
    css_refs = re.findall(r'<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"', src)
    js_refs = re.findall(r'<script[^>]*src="([^"]+)"', src)
    bad = []
    for r in css_refs + js_refs:
        if not os.path.exists(os.path.join(ROOT, r)):
            bad.append(r)
    print("源文件：%d 个 css、%d 个 js" % (len(css_refs), len(js_refs)))
    if bad:
        print("  ✗ 找不到：%s" % "、".join(bad))
        return 1
    if os.path.exists(BUILD):
        b = read(BUILD)
        nc = len(RE_CSS_BLOCK.findall(b))
        nj = len(RE_JS_BLOCK.findall(b))
        print("单文件：%d 个 css 块、%d 个 js 块" % (nc, nj))
        if nc != len(css_refs) or nj != len(js_refs):
            print("  ✗ 数量对不上，单文件可能是旧的，重新 build.py 再拆")
            return 1
        print("  ✓ 数量对得上")
    print("  ✓ 源文件引用都在")
    return 0


def main():
    if "--check" in sys.argv:
        sys.exit(check())

    if not os.path.exists(BUILD):
        raise SystemExit("没有 build/沙井村前端.单文件.html，先跑 build.py")
    html = read(BUILD)

    css_blocks = RE_CSS_BLOCK.findall(html)
    js_blocks = RE_JS_BLOCK.findall(html)
    if not css_blocks and not js_blocks:
        raise SystemExit(
            "单文件里没有 <!--css:…--> / <!--js:…--> 标记，"
            "多半是旧版本打出来的。请先在 沙井村前端.html 里手工补好引用再打包。")

    m = RE_BODY.search(html)
    if not m:
        raise SystemExit("找不到 <body>")
    body = m.group(1)
    # 剥掉内联的块（连标记一起）
    body = re.sub(r"\n*<!--(?:css|js):[^\n]+?-->\s*<style>\n.*?\n</style>\n*", "\n",
                  body, flags=re.S)
    body = re.sub(r"\n*<!--(?:css|js):[^\n]+?-->\s*<script>\n.*?\n</script>\n*", "\n",
                  body, flags=re.S)

    for path, content in css_blocks:
        content = content.replace('url("assets/fonts/', 'url("../fonts/')
        content = content.replace("url('assets/fonts/", "url('../fonts/")
        content = content.replace('url("assets/shajing/', 'url("../shajing/')
        content = content.replace("url('assets/shajing/", "url('../shajing/")
        write(os.path.join(ROOT, path), CSS_BANNER + content + "\n")

    for path, content in js_blocks:
        banner = JS_BANNER.get(path, "")
        write(os.path.join(ROOT, path), banner + content.strip("\n") + "\n")

    # 复原标记：head 里去掉内联块，body 末尾补回 script 标签
    head_src = re.search(r"<head>\n(.*?)\n</head>", html, re.S)
    if not head_src:
        raise SystemExit("找不到 <head>")
    inner = head_src.group(1)
    inner = re.sub(r"<!--css:[^\n]+?-->\s*<style>.*?</style>", "", inner, flags=re.S)
    inner = re.sub(r"<!--js:[^\n]+?-->\s*<script>.*?</script>", "", inner, flags=re.S)

    css_tags = "\n".join('<link rel="stylesheet" href="%s">' % p for p, _ in css_blocks)
    js_tags = "\n".join('<script src="%s"></script>' % p for p, _ in js_blocks)

    markup = (
        "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n%s\n%s\n</head>\n"
        "<body>\n\n%s\n\n%s\n</body>\n</html>\n"
        % (inner.strip("\n"), css_tags, body.strip("\n"), js_tags)
    )
    write(SRC, markup)

    print("已拆分：")
    for p, _ in css_blocks + js_blocks:
        full = os.path.join(ROOT, p)
        print("  %-46s %7d B" % (p, os.path.getsize(full)))
    print("  %-46s %7d B" % ("沙井村前端.html", os.path.getsize(SRC)))


if __name__ == "__main__":
    main()
