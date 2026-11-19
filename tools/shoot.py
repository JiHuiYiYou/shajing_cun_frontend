# -*- coding: utf-8 -*-
"""沙井村 · 舆图 — 浏览器截图与巡检脚本

    python tools/shoot.py            # 全量巡检（截图 + 控制台报错）
    python tools/shoot.py --mobile   # 只跑移动端几档

产物写入 tools/shots/。

巡的是**世界**里的走法：择人 → 走近公会地议案 → 走近谷场过月 →
走近村庙看村志 → 走近村小学校看族属谱 → 寻人定位 → 岁末结算。
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


async def main():
    mobile = "--mobile" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1600, "height": 950}, device_scale_factor=1)
        pg.on("console", lambda m: errs.append(("console:" + m.type, m.text))
              if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(("pageerror", str(e))))

        async def shot(name):
            await pg.screenshot(path=os.path.join(OUT, name + ".png"))

        async def walk_to(name):
            await pg.evaluate("""(n) => {
              const e = window.World.byId.get('place:' + n);
              const p = window.World.player;
              if (!e || !p) return;
              p.x = e.x + 46; p.y = e.y + 46;
              window.World.lookAt(p.x, p.y, true);
            }""", name)
            await pg.wait_for_timeout(650)

        async def press_e():
            await pg.keyboard.press("e")
            await pg.wait_for_timeout(850)

        async def esc():
            await pg.keyboard.press("Escape")
            await pg.wait_for_timeout(650)

        await pg.goto(URL, wait_until="networkidle")
        await pg.wait_for_timeout(2800)
        await shot("1-boot")

        await pg.click("#bootGo")
        await pg.wait_for_timeout(2000)
        await shot("2-pick")

        cards = await pg.locator(".pcard").count()
        print("择人候选：%d 人" % cards)
        if cards:
            await pg.locator(".pcard").nth(1).click()
            await pg.wait_for_timeout(400)
            await shot("3-pick-detail")
            await pg.click("#pickGo")
            await pg.wait_for_timeout(2200)
            await shot("4-world")

        # 走两步
        await pg.keyboard.down("d")
        await pg.wait_for_timeout(900)
        await pg.keyboard.up("d")
        await pg.wait_for_timeout(600)
        await shot("5-walk")

        # 走近一个人
        await pg.evaluate("""() => {
          const e = window.World.entities.find(x => x.kind === 'villager');
          if (!e) return;
          const p = window.World.player;
          p.x = e.x + 40; p.y = e.y + 40;
          window.World.lookAt(p.x, p.y, true);
        }""")
        await pg.wait_for_timeout(700)
        await press_e()
        await shot("6-person")
        await esc()

        # 公会地：议本月案卷
        await walk_to("公会地")
        await press_e()
        await shot("7-case")
        opts = await pg.locator(".opt").count()
        print("本月案卷：%d 案可选" % opts)
        if opts:
            await pg.locator(".opt").first.click()
            await pg.wait_for_timeout(1000)
            await shot("8-decided")
        await esc()

        # 谷场：过月
        await walk_to("谷场")
        await press_e()
        await shot("9-yard")
        if await pg.locator(".hb.primary").count():
            await pg.locator(".hb.primary").first.click()
            await pg.wait_for_timeout(1800)
            print("过月后：第 %d 年 %d 月" % (
                await pg.evaluate("() => S.year"), await pg.evaluate("() => S.month")))
        await shot("10-month2")

        # 村庙：村志
        await walk_to("村庙")
        await press_e()
        await shot("11-temple")
        if await pg.locator(".placeacts .hb").count():
            await pg.locator(".placeacts .hb").first.click()
            await pg.wait_for_timeout(1300)
            await shot("12-gazetteer")
            for i in range(4):
                tabs = pg.locator(".gztab")
                if await tabs.count() > i:
                    await tabs.nth(i).click()
                    await pg.wait_for_timeout(650)
                    await shot("13-gz-%d" % i)
        await esc()

        # 村小学校：族属谱
        await walk_to("村小学校")
        await press_e()
        if await pg.locator(".placeacts .hb").count():
            await pg.locator(".placeacts .hb").first.click()
            await pg.wait_for_timeout(1500)
            await shot("14-kin")
            kin = pg.locator('.kinn[data-no]')
            if await kin.count():
                await kin.first.click()
                await pg.wait_for_timeout(700)
                await shot("15-kin-pick")
        await esc()

        # 寻人
        await pg.click("#btnFind")
        await pg.wait_for_timeout(700)
        await pg.fill("#q", "会首")
        await pg.wait_for_timeout(900)
        await shot("16-find")
        print("寻人结果：%d 行" % await pg.locator("#dlist .row").count())
        if await pg.locator("#dlist .row").count():
            await pg.locator("#dlist .row").first.click()
            await pg.wait_for_timeout(1200)
            await shot("17-find-goto")
        await esc()

        # 缩放
        await pg.click("#btnZoomIn")
        await pg.wait_for_timeout(900)
        await shot("18-zoom")
        await pg.click("#btnZoomOut")
        await pg.click("#btnZoomOut")
        await pg.wait_for_timeout(900)
        await shot("19-zoomout")

        # 走完十二个月看岁末
        for _ in range(14):
            done = await pg.evaluate("() => S.done")
            if done:
                break
            await walk_to("公会地")
            await press_e()
            if await pg.locator(".opt").count():
                await pg.locator(".opt").first.click()
                await pg.wait_for_timeout(700)
            await esc()
            await walk_to("谷场")
            await press_e()
            if await pg.locator(".hb.primary").count():
                await pg.locator(".hb.primary").first.click()
                await pg.wait_for_timeout(1500)
            await esc()
        await pg.wait_for_timeout(900)
        await shot("20-end")

        # 移动端
        for w, h in ((430, 900), (390, 844), (768, 1024)):
            await pg.set_viewport_size({"width": w, "height": h})
            await pg.wait_for_timeout(1100)
            await shot("21-mobile-%d" % w)

        print("ERRORS:", len(errs))
        for k, v in errs[:30]:
            print("  ", k, "::", v[:240])
        await b.close()


asyncio.run(main())
