# -*- coding: utf-8 -*-
"""把 html / css / js / 图片 / 字体打成一个自包含的单文件页面。

    python tools/build.py
    python tools/build.py --no-tiles     # 连总览图也不内联（最小包）

产出 build/沙井村前端.单文件.html —— 不依赖任何外部目录，双击即可看，
可直接发给别人或挂到任意静态托管上。

顺序要紧：先把 css / js 塞进 html，再把资源引用换成 data URI；
反过来的话，<script src> 会被当成资源先内联掉。

多文件：按 html 里出现的顺序逐个内联，每块前面留一行标记注释
<!--css:assets/css/xxx.css--> / <!--js:assets/js/xxx.js-->，
split.py 靠这些标记无损还原。

不内联的：assets/map/ 下的瓦片与 assets/char/ 下的立绘。
它们由脚本运行时拼 URL 塞进 <img>，静态 html 里根本没有这些引用，
所以打包器看不见它们；单文件版里这些图会 404，
瓦片退回总览、立绘退回剪影——页面照样能玩，只是放大后略糊。
"""
import base64
import io
import mimetypes
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build", "沙井村前端.单文件.html")
SRC_HTML = os.path.join(ROOT, "沙井村前端.html")

RE_URL = re.compile(r"""url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)""")
RE_SRC = re.compile(r'src="([^"]+)"')
RE_CSS_LINK = re.compile(r'<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>')
RE_JS_TAG = re.compile(r'<script[^>]*src="([^"]+)"[^>]*></script>')

# 这些图太大，不进单文件：
#   舆图主图（6144×4080，5MB）——单文件版退回内嵌的总览（糊，但能玩）
#   九块瓦片（主图已经缝好了，单独摆反而有格线）
#   十六张立绘——单文件版退回剪影
SKIP = re.compile(r"^assets/map/(world\.jpg|tile_)|^assets/char/")


def read(p):
    with io.open(p, "r", encoding="utf-8") as f:
        return f.read()


def data_uri(path):
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with open(path, "rb") as f:
        return "data:%s;base64,%s" % (mime, base64.b64encode(f.read()).decode("ascii"))


def resolve(base_dir, url):
    if url.startswith(("data:", "http:", "https:", "#", "mailto:")):
        return None
    path = os.path.normpath(os.path.join(base_dir, url))
    return path if os.path.exists(path) else None


def inline_css(text, base_dir):
    """把 css 里的外部资源换成 data URI。

    SVG 数据 URI 内部常含 url(#滤镜) 这类片段引用，不能当文件
    路径去找；data: 与片段引用一律原样放过。
    """
    def repl(m):
        url = next(g for g in m.groups() if g is not None)
        if url.startswith(("data:", "#")) or "%23" in url:
            return m.group(0)
        p = resolve(base_dir, url)
        if not p:
            print("  跳过（找不到）：%s" % url)
            return m.group(0)
        if SKIP.match(os.path.relpath(p, ROOT).replace("\\", "/")):
            return m.group(0)
        return 'url("%s")' % data_uri(p)
    return RE_URL.sub(repl, text)


def inline_html(text, base_dir):
    def repl(m):
        url = m.group(1)
        p = resolve(base_dir, url)
        if not p:
            return m.group(0)
        if SKIP.match(os.path.relpath(p, ROOT).replace("\\", "/")):
            return m.group(0)
        return 'src="%s"' % data_uri(p)
    return RE_SRC.sub(repl, text)


def main():
    html = read(SRC_HTML)

    # 一、内联 css —— 先做，免得 <link> 里的 url() 被当成资源处理
    css_files = []

    def css_repl(m):
        href = m.group(1)
        path = os.path.join(ROOT, href)
        if not os.path.exists(path):
            print("  跳过 css（找不到）：%s" % href)
            return m.group(0)
        css_files.append(href)
        css = inline_css(read(path), os.path.dirname(path))
        return "<!--css:%s-->\n<style>\n%s\n</style>" % (href, css)

    html = RE_CSS_LINK.sub(css_repl, html)

    # 二、内联 js
    js_files = []

    def js_repl(m):
        src = m.group(1)
        path = os.path.join(ROOT, src)
        if not os.path.exists(path):
            print("  跳过 js（找不到）：%s" % src)
            return m.group(0)
        js_files.append(src)
        return "<!--js:%s-->\n<script>\n%s\n</script>" % (src, read(path))

    html = RE_JS_TAG.sub(js_repl, html)

    if '<script src=' in html or 'rel="stylesheet"' in html:
        raise SystemExit("仍有未内联的 css / js 引用，检查沙井村前端.html 的写法")

    # 三、再把剩下的资源引用换成 data URI
    html = inline_html(html, ROOT)

    # 四、字体已随 css 内联，preload 指向同一份，去掉多余的 preload
    html = re.sub(r'\n?<link rel="preload"[^>]*>\n?', "\n", html)

    # 五、挂上「单文件」标记：主图与立绘都没内联，页面据此退回去
    html = html.replace("<html lang=", '<html data-single lang=', 1)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    size = os.path.getsize(OUT)
    print("已打包：%s  (%.2f MB)" % (os.path.relpath(OUT, ROOT), size / 1024 / 1024))
    print("  css: %s" % ", ".join(css_files))
    print("  js : %s" % ", ".join(js_files))


if __name__ == "__main__":
    main()
