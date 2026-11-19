# -*- coding: utf-8 -*-
"""从识别结果生成世界坐标表 assets/js/sites.js。

    python tools/mapgen/derive_sites.py

做三件事：
  1. 把七十二户分配到识别出来的院落群上——同一个宗族住成一片，
     一个院子里往往住两三家（一正三厢，一个院子几户人）。
  2. 给每户一个「门前可站立点」，给每处地点一个位置，给出碰撞盒。
  3. 把白河折线与石桥位置问出来，好让角色能过桥。

坐标一律换算到世界像素（世界 = 6144×4080 = 粗图的 2 倍）。
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mmapi
import style

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
REGIONS = os.path.join(WORK, "regions.json")
OUT = os.path.join(style.ROOT, "assets", "js", "sites.js")

SCALE = 2.0                    # 粗图 -> 世界
BASE_W, BASE_H = 3072, 2040

# app.js 的 PLACE_P：五处地点各自的当事人
PLACE_PEOPLE = {"村庙": "1", "白河": "1", "公会地": "53", "村小学校": "49", "谷场": "52"}
# 月度承办人：月份 -> (户号, 地点名)
MONTH_ACTOR = {1: ("39", "村庙"), 2: ("53", "公会地"), 3: ("32", "村庙"), 4: ("49", "公会地"),
               5: ("1", "村庙"), 6: ("1", "白河"), 7: ("1", "村庙"), 8: ("39", "公会地"),
               9: ("1", "村庙"), 10: ("4", "村庙"), 11: ("49", "村小学校"), 12: ("3", "村庙")}
CLAN_ORDER = ["李", "杨", "张", "杜", "刘", "赵", "孙", "王", "崇", "任", "周", "景", "柏", "傅", "其他"]

RIVER_PROMPT = """这是一幅民国南方乡村的水墨舆图，尺寸 %d×%d 像素。
图上有一条自东北角斜贯的白河，河上有一座石拱桥。

请只输出 JSON，不要解释：
{
  "river_pts": [[0,0],[0,0],[0,0],[0,0],[0,0]],
  "bridge": [0,0],
  "width": 90
}
river_pts 是沿河中心线从上（东北）到下（西南）依次取的 5 个点；
bridge 是石拱桥的中心点；width 是河宽（像素，估计即可）。""" % (BASE_W, BASE_H)


def load_data():
    src = io.open(os.path.join(style.ROOT, "assets", "js", "data.js"), encoding="utf-8").read()
    m = re.search(r"const DATA = (\{.*\});", src, re.S)
    return json.loads(m.group(1))


def ask_river():
    p = os.path.join(WORK, "river.json")
    if os.path.exists(p):
        return json.load(io.open(p, encoding="utf-8"))
    raw = mmapi.wait_retry(lambda: mmapi.chat_json(RIVER_PROMPT,
                                                   os.path.join(WORK, "base_clean.jpg"),
                                                   max_tokens=1200))
    with io.open(p, "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=1)
    return raw


def order_spatially(buildings):
    """给院落排一个空间顺序：从上往下、先左后右，好让同族住得连片。"""
    def key(b):
        x = b["x"] + b["w"] / 2
        y = b["y"] + b["h"] / 2
        band = int(y / (BASE_H / 3.0))
        return (band, x)
    return sorted(buildings, key=key)


def assign(data, buildings):
    """把七十二户分到院落群上。

    同族住成一片：一族一片区，片区在图上按空间顺序切成连续的段。
    一个院子往往住两三家（一正三厢，一个院子几户人），
    所以按院子的面积分配户数，大院子多住几户。
    """
    hh = data["households"]
    by_clan = {}
    for h in hh:
        by_clan.setdefault(h.get("clanG") or "其他", []).append(h)
    for c in by_clan:
        by_clan[c].sort(key=lambda h: (-(h.get("manageN") or 0), int(h["no"])))

    order = order_spatially(buildings)
    n_clan = len(by_clan)
    per = max(1, int(round(len(order) / float(n_clan))))
    zones = {}
    for i, b in enumerate(order):
        ci = min(n_clan - 1, i // per)
        zones.setdefault(ci, []).append(b)

    result = {}
    leftovers = []
    for ci in sorted(zones):
        bs = zones[ci]
        clan = CLAN_ORDER[ci] if ci < len(CLAN_ORDER) else "其他"
        pool = list(by_clan.get(clan, []))
        bs = sorted(bs, key=lambda b: -(b["w"] * b["h"]))
        total_area = sum(b["w"] * b["h"] for b in bs) or 1
        want = len(pool)
        for b in bs:
            if want <= 0 or not pool:
                break
            share = (b["w"] * b["h"]) / total_area
            n = max(1, int(round(share * want)))
            take = [pool.pop(0) for _ in range(min(n, len(pool)))]
            if not take:
                break
            for h in take:
                result[h["no"]] = b
            want -= len(take)
        leftovers.extend(pool)

    # 没分到的：找还没住人的院落；实在没有了就并进已有的院子
    used = set(id(v) for v in result.values())
    free = [b for b in order if id(b) not in used]
    for h in leftovers:
        b = free.pop(0) if free else order[int(h["no"]) % len(order)]
        result[h["no"]] = b

    # 同一院子里的几户，门口的落点要错开
    per_b = {}
    for no, b in result.items():
        per_b.setdefault(id(b), []).append(no)
    out = {}
    for nos in per_b.values():
        nos.sort(key=lambda x: int(x))
        for k, no in enumerate(nos):
            out[no] = (result[no], k, len(nos))
    # 一个都不能少
    for h in hh:
        if h["no"] not in out:
            b = order[int(h["no"]) % len(order)]
            out[h["no"]] = (b, 0, 1)
    return out


def door_point(b, idx, n, boxes):
    """门口的落脚点。

    识别出来的院子框往往比屋子本身大，还常常把旁边的院子也框进去，
    所以按框底中点站人，常常一脚踩进人家的墙里。
    这里沿着框的四边挨个试，挑一个不在任何院框里的空地。
    """
    x, y, w, h = b["x"], b["y"], b["w"], b["h"]
    offs = [0.5] if n <= 1 else [(i + 0.5) / n for i in range(n)]
    cands = []
    for o in offs:
        cands.append((x + o * w, y + h + 18))     # 临街的那一侧
    for o in offs:
        cands.append((x + o * w, y - 18))
    for o in offs:
        cands.append((x - 18, y + o * h))
        cands.append((x + w + 18, y + o * h))
    for (px, py) in cands:
        if not inside_any(px, py, boxes):
            return int(px * SCALE), int(py * SCALE)
    px = x + offs[min(idx, len(offs) - 1)] * w
    py = y + h + 18
    return int(px * SCALE), int(py * SCALE)


def inside_any(px, py, boxes, pad=14):
    for (bx, by, bw, bh) in boxes:
        if bx - pad < px < bx + bw + pad and by - pad < py < by + bh + pad:
            return True
    return False


def base_boxes(buildings, inset=18):
    """院子内缩后的碰撞框（粗图坐标）。内缩得多些，好留出街巷能走。"""
    out = []
    for b in buildings:
        w = b["w"] - 2 * inset
        h = b["h"] - 2 * inset
        if w < 24 or h < 24:
            continue
        out.append([b["x"] + inset, b["y"] + inset, w, h])
    return out


def make_colliders(boxes):
    """把院子框变成碰撞盒（粗图坐标 -> 世界坐标）。"""
    boxes = [list(b) for b in boxes]
    # 外扩 4px 后交叠面积 > 60% 就合并
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b2 = boxes[i], boxes[j]
                ax0, ay0, ax1, ay1 = a[0] - 4, a[1] - 4, a[0] + a[2] + 4, a[1] + a[3] + 4
                bx0, by0, bx1, by1 = b2[0] - 4, b2[1] - 4, b2[0] + b2[2] + 4, b2[1] + b2[3] + 4
                ox = min(ax1, bx1) - max(ax0, bx0)
                oy = min(ay1, by1) - max(ay0, by0)
                if ox <= 0 or oy <= 0:
                    continue
                inter = ox * oy
                if inter > 0.6 * min(a[2] * a[3], b2[2] * b2[3]):
                    x0 = min(a[0], b2[0]); y0 = min(a[1], b2[1])
                    x1 = max(a[0] + a[2], b2[0] + b2[2]); y1 = max(a[1] + a[3], b2[1] + b2[3])
                    boxes[i] = [x0, y0, x1 - x0, y1 - y0]
                    boxes.pop(j)
                    merged = True
                    break
            if merged:
                break
    out = []
    for b in boxes:
        out.append({"x": int(b[0] * SCALE), "y": int(b[1] * SCALE),
                    "w": int(b[2] * SCALE), "h": int(b[3] * SCALE)})
    out.sort(key=lambda c: c["w"] * c["h"])
    return out


def main():
    data = load_data()
    rg = json.load(io.open(REGIONS, encoding="utf-8"))
    builds = rg["buildings"]
    if not builds:
        raise SystemExit("没识别出院落，先跑 describe.py")

    assign_map = assign(data, builds)
    boxes = base_boxes(builds)
    houses = []
    for h in data["households"]:
        b, idx, n = assign_map[h["no"]]
        px, py = door_point(b, idx, n, boxes)
        houses.append({"no": h["no"], "x": px, "y": py})
    # 按姓聚在一起，方便看
    houses.sort(key=lambda d: int(d["no"]))

    lm = rg["landmarks"]
    def P(k):
        v = lm.get(k) or [0, 0]
        return [int(v[0] * SCALE), int(v[1] * SCALE)]

    places = [
        {"name": "村庙", "x": P("temple")[0], "y": P("temple")[1]},
        {"name": "公会地", "x": P("communal_field")[0], "y": P("communal_field")[1]},
        {"name": "村小学校", "x": P("school")[0], "y": P("school")[1]},
        {"name": "谷场", "x": P("threshing_yard")[0], "y": P("threshing_yard")[1]},
    ]

    # 白河：问折线与桥
    river = {"pts": [], "width": 90, "bridges": []}
    try:
        rr = ask_river()
        pts = []
        for p in (rr.get("river_pts") or [])[:12]:
            try:
                pts.append([int(float(p[0]) * SCALE), int(float(p[1]) * SCALE)])
            except Exception:
                pass
        river["pts"] = pts
        river["width"] = int(float(rr.get("width") or 90) * SCALE)
        b = rr.get("bridge") or [0, 0]
        bx, by = int(float(b[0]) * SCALE), int(float(b[1]) * SCALE)
        if bx and by:
            river["bridges"].append({"x0": bx - 110, "x1": bx + 110, "y": by})
        river["bridge_center"] = [bx, by]
    except Exception as e:
        print("白河没问出来（%s），先不设阻挡" % e)
    if river["pts"]:
        # 白河地点取折线中点
        mid = river["pts"][len(river["pts"]) // 2]
        places.append({"name": "白河", "x": mid[0], "y": mid[1]})

    # 主街折线：视觉模型给的，坐标换到世界
    street_pts = []
    for p2 in (rg.get("street") or [])[:60]:
        try:
            street_pts.append([int(float(p2[0]) * SCALE), int(float(p2[1]) * SCALE)])
        except Exception:
            pass

    props = []
    # 器物：位置由已知的地点推出来（井与桥是识别出来的，其余就近安置）
    def near(pt, dx, dy):
        return {"x": int(pt[0] + dx), "y": int(pt[1] + dy)}
    bridge = river.get("bridge_center") or [0, 0]
    props.append({"id": "well", "name": "沙井", **near(P("well"), 0, 0)})
    if bridge[0]:
        props.append({"id": "bridge", "name": "石拱桥", **near(bridge, 0, 0)})
    yard = P("threshing_yard")
    props.append({"id": "mill", "name": "石碾盘", **near(yard, 150, 60)})
    props.append({"id": "granary", "name": "谷仓", **near(yard, -170, 40)})
    props.append({"id": "stage", "name": "戏台", **near(P("temple"), -40, 110)})
    props.append({"id": "oldtree", "name": "古槐", **near(P("well"), -230, -60)})
    props.append({"id": "waterwheel", "name": "水碓", **near(mid if river.get("pts") else P("well"), 260, 130)})
    for i, (dx, dy) in enumerate([(-320, -260), (330, -300), (300, 320)]):
        props.append({"id": "stele%d" % (i + 1), "name": "界碑", **near(P("well"), dx, dy)})

    # 立绘池（与 gen_char.py 一致）
    pool_path = os.path.join(style.ROOT, "assets", "char", "pool.json")
    chars = []
    if os.path.exists(pool_path):
        chars = json.load(io.open(pool_path, encoding="utf-8")).get("pool", [])

    sites = {
        "world": {"w": style.WORLD_W, "h": style.WORLD_H},
        "chars": chars,
        "houses": houses,
        "places": places,
        "props": props,
        "street": street_pts,
        "colliders": make_colliders(boxes),
        "river": river,
    }

    with io.open(OUT, "w", encoding="utf-8") as f:
        f.write("/* ============================================================\n")
        f.write("   沙井村 · 舆图 — 世界坐标表\n")
        f.write("   由 tools/mapgen/derive_sites.py 从舆图识别结果生成。\n")
        f.write("   坐标为世界像素（原点在舆图左上角）。\n")
        f.write("   人工微调请用 tools/placer.html，改完再跑一次本脚本会覆盖，\n")
        f.write("   所以调好后请把本文件另存为 assets/js/sites.final.js 并改引用。\n")
        f.write("   ============================================================ */\n")
        f.write("const SITES = ")
        f.write(json.dumps(sites, ensure_ascii=False, indent=1))
        f.write(";\n")
    print("已写 %s" % OUT)
    print("  户 %d，地点 %d，道具 %d，碰撞盒 %d，立绘池 %d"
          % (len(houses), len(places), len(props), len(sites["colliders"]), len(chars)))
    print("  地点：%s" % [(p["name"], p["x"], p["y"]) for p in places])


if __name__ == "__main__":
    main()
