# -*- coding: utf-8 -*-
"""快速体检：开页、点入村、择人、走动、看有没有报错。

    python tools/check.py [截图前缀]
"""
import asyncio
import os
import sys
import urllib.parse

from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tools", "shots")
PORT = int(os.environ.get("PORT", "8899"))
URL = "http://127.0.0.1:%d/" % PORT + urllib.parse.quote("沙井村前端.html")
PREFIX = sys.argv[1] if len(sys.argv) > 1 else "w"


async def main():
    os.makedirs(OUT, exist_ok=True)
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1600, "height": 950}, device_scale_factor=1)
        pg.on("console", lambda m: errs.append(("console:" + m.type, m.text))
              if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(("pageerror", str(e))))
        await pg.goto(URL, wait_until="networkidle")
        await pg.wait_for_timeout(2800)
        await pg.screenshot(path=os.path.join(OUT, PREFIX + "-0-boot.png"))

        await pg.click("#bootGo")
        await pg.wait_for_timeout(1800)
        await pg.screenshot(path=os.path.join(OUT, PREFIX + "-1-pick.png"))

        # 择人
        cards = await pg.locator(".pcard").count()
        print("候选卡:", cards)
        if cards:
            await pg.locator(".pcard").first.click()
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=os.path.join(OUT, PREFIX + "-2-pickdetail.png"))
            await pg.click("#pickGo")
            await pg.wait_for_timeout(2500)
            await pg.screenshot(path=os.path.join(OUT, PREFIX + "-3-world.png"))

        st = await pg.evaluate("""() => ({
          world: !!window.World,
          ents: window.World ? window.World.entities.length : -1,
          player: window.World && window.World.player ? [Math.round(window.World.player.x), Math.round(window.World.player.y)] : null,
          cam: window.World ? [Math.round(window.World.cam.x), Math.round(window.World.cam.y), window.World.cam.z.toFixed(2)] : null,
          met: window.S ? window.S.met.size : -1,
          playerNo: window.S ? window.S.player : null,
          tiles: document.querySelectorAll('.tile').length,
          tilesOn: document.querySelectorAll('.tile.on').length,
          tags: document.querySelectorAll('#tagLayer .tag').length,
          mk: document.querySelectorAll('.mk').length,
          place: document.querySelectorAll('.ent--place').length,
          prop: document.querySelectorAll('.ent--prop').length,
          prompt: (document.getElementById('prompt')||{}).textContent
        })""")
        print("状态:", st)

        # 走动
        await pg.keyboard.down("d")
        await pg.wait_for_timeout(1400)
        await pg.keyboard.up("d")
        await pg.wait_for_timeout(700)
        st2 = await pg.evaluate("""() => ({
          player: window.World && window.World.player ? [Math.round(window.World.player.x), Math.round(window.World.player.y)] : null,
          cam: window.World ? [Math.round(window.World.cam.x), Math.round(window.World.cam.y)] : null,
          prompt: (document.getElementById('prompt')||{}).textContent
        })""")
        print("走动后:", st2)
        await pg.screenshot(path=os.path.join(OUT, PREFIX + "-4-walk.png"))

        # 放大
        await pg.click("#btnZoomIn")
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=os.path.join(OUT, PREFIX + "-5-zoom.png"))
        st3 = await pg.evaluate("() => ({z: window.World.cam.z.toFixed(2), tilesOn: document.querySelectorAll('.tile.on').length})")
        print("放大后:", st3)

        print("ERRORS:", len(errs))
        for k, v in errs[:25]:
            print("  ", k, "::", v[:240])
        await b.close()


asyncio.run(main())
