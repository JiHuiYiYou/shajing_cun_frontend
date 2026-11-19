# -*- coding: utf-8 -*-
"""走一遍玩法：择人 → 公会地结案 → 谷场过月 → 村庙看村志 → 村小学校看族属谱 → 寻人。

    python tools/walk.py
"""
import asyncio
import os
import urllib.parse

from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tools", "shots")
PORT = int(os.environ.get("PORT", "8899"))
URL = "http://127.0.0.1:%d/" % PORT + urllib.parse.quote("沙井村前端.html")


async def main():
    os.makedirs(OUT, exist_ok=True)
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1600, "height": 950})
        pg.on("console", lambda m: errs.append((m.type, m.text))
              if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(("pageerror", str(e))))
        await pg.goto(URL, wait_until="networkidle")
        await pg.wait_for_timeout(2800)
        await pg.click("#bootGo")
        await pg.wait_for_timeout(2200)
        await pg.click("#pickGo")
        await pg.wait_for_timeout(2000)

        async def walk_to(name):
            await pg.evaluate("""(n) => {
              const e = window.World.byId.get('place:' + n);
              const p = window.World.player;
              if (!e || !p) return false;
              p.x = e.x + 46; p.y = e.y + 46;
              window.World.lookAt(p.x, p.y, true);
            }""", name)
            await pg.wait_for_timeout(600)
            print("   [走到]", name, "modal =", await pg.evaluate("() => document.getElementById('modal').className"),
                  "playerAt", await pg.evaluate("() => [Math.round(World.player.x), Math.round(World.player.y)]"),
                  "focus", await pg.evaluate("() => World.focus ? World.focus.id : null"))

        async def esc():
            await pg.keyboard.press("Escape")
            await pg.wait_for_timeout(700)
            print("   [esc] modal =", await pg.evaluate("() => document.getElementById('modal').className"))

        # ---- 公会地：开案卷 ----
        await walk_to("公会地")
        await pg.keyboard.press("e")
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=os.path.join(OUT, "p-1-hall.png"))
        await pg.screenshot(path=os.path.join(OUT, "p-2-case.png"))
        opts = await pg.locator(".opt").count()
        print("案卷选项:", opts)
        before = await pg.evaluate("() => [S.money, S.rep, S.clash, S.dec[1] ? 1 : 0]")
        if opts:
            await pg.locator(".opt").first.click()
            await pg.wait_for_timeout(1000)
        after = await pg.evaluate("() => [S.money, S.rep, S.clash, S.dec[1] ? 1 : 0]")
        print("抉择前", before, "→ 后", after)

        # ---- 谷场：过月 ----
        await esc()
        await walk_to("谷场")
        await pg.keyboard.press("e")
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=os.path.join(OUT, "p-3-yard.png"))
        print("谷场过月按钮:", await pg.locator(".hb.primary").count())
        if await pg.locator(".hb.primary").count():
            await pg.locator(".hb.primary").first.click()
            await pg.wait_for_timeout(1800)
            print("过月后 month =", await pg.evaluate("() => S.month"))
        await pg.screenshot(path=os.path.join(OUT, "p-4-month2.png"))

        # ---- 村庙：村志 ----
        await esc()
        await walk_to("村庙")
        await pg.keyboard.press("e")
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=os.path.join(OUT, "p-5-temple.png"))
        print("村庙可做的事:", await pg.locator(".placeacts .hb").count())
        if await pg.locator(".placeacts .hb").count():
            await pg.locator(".placeacts .hb").first.click()
            await pg.wait_for_timeout(1200)
            await pg.screenshot(path=os.path.join(OUT, "p-6-gazetteer.png"))
            print("村志页签:", await pg.locator(".gztab").count())

        # ---- 村小学校：族属谱 ----
        await esc()
        await walk_to("村小学校")
        await pg.keyboard.press("e")
        await pg.wait_for_timeout(800)
        if await pg.locator(".placeacts .hb").count():
            await pg.locator(".placeacts .hb").first.click()
            await pg.wait_for_timeout(1400)
            await pg.screenshot(path=os.path.join(OUT, "p-7-kin.png"))
            print("族属谱节点:", await pg.locator(".kinn").count())

        # ---- 寻人 ----
        await esc()
        await pg.click("#btnFind")
        await pg.wait_for_timeout(700)
        await pg.fill("#q", "会首")
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=os.path.join(OUT, "p-8-find.png"))
        print("寻人结果行数:", await pg.locator("#dlist .row").count())
        if await pg.locator("#dlist .row").count():
            cam0 = await pg.evaluate("() => [Math.round(World.cam.x), Math.round(World.cam.y)]")
            await pg.locator("#dlist .row").first.click()
            await pg.wait_for_timeout(1200)
            cam1 = await pg.evaluate("() => [Math.round(World.cam.x), Math.round(World.cam.y)]")
            print("寻人镜头", cam0, "→", cam1)

        print("ERRORS:", len(errs))
        for k, v in errs[:20]:
            print("  ", k, "::", v[:200])
        await b.close()


asyncio.run(main())
