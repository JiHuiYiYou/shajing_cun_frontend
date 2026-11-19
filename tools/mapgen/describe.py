# -*- coding: utf-8 -*-
"""让多模态模型读图，吐出舆图的结构。

    python tools/mapgen/describe.py            # 读 work/base_clean.jpg -> work/regions.json
    python tools/mapgen/describe.py --show     # 顺带把识别框画到图上

这一步是「以生图为中心」的落地：世界长什么样由图决定，
不是先定坐标再让图去凑。模型给出九格各是什么、房子在哪儿、
主街怎么走、五处地点在哪，后面的精修 prompt 与摆位都从这里出。
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mmapi
import style

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
SRC = os.path.join(WORK, "base_clean.jpg")
OUT = os.path.join(WORK, "regions.json")

IMG_W, IMG_H = 3072, 2040

PROMPT = """这是一幅民国南方乡村的水墨舆图，尺寸 %d×%d 像素。
图上画的是：一片村落、白河与桥、稻田与公产地、一个圆形打谷场、一座绿瓦大庙、
一所带操场的学校、一口带红印的水井。

请只输出 JSON，不要任何解释。坐标一律以图片左上角为原点，单位为像素。

格式：
{
  "regions": {
    "0_0": "该格(第1行第1列)里画了什么，一句话，20字以内",
    "0_1": "…", "0_2": "…", "1_0": "…", "1_1": "…", "1_2": "…",
    "2_0": "…", "2_1": "…", "2_2": "…"
  },
  "buildings": [
    {"x": 0, "y": 0, "w": 0, "h": 0}
  ],
  "street": [[0,0],[0,0]],
  "landmarks": {
    "well": [0,0],
    "temple": [0,0],
    "school": [0,0],
    "communal_field": [0,0],
    "threshing_yard": [0,0]
  },
  "river": {"bbox": [0,0,0,0]}
}

说明：
* buildings 列出你能看清的每一处独立院落/房屋群的矩形框，尽量多，至少 20 个，按画面从左上到右下排。
* street 是村中主街的折线（沿街走的大路），至少 5 个点。
* landmarks 给每处地点的中心点坐标；水井是那个中央带红色圆印的石台，
  村庙是绿瓦大庙，村小学校是带方形操场的那组院子，公会地是大片田块，
  谷场是那个圆形的场院。
* 只输出 JSON。""" % (IMG_W, IMG_H)


def norm(data):
    """模型不一定听话，把缺的东西补齐、把离谱的值夹住。"""
    data = data or {}
    regions = {}
    for r in range(3):
        for c in range(3):
            k = "%d_%d" % (r, c)
            v = data.get("regions", {}).get(k, "")
            regions[k] = str(v)[:60]
    builds = []
    for b in (data.get("buildings") or [])[:140]:
        try:
            x, y, w, h = float(b["x"]), float(b["y"]), float(b["w"]), float(b["h"])
        except Exception:
            continue
        if w <= 0 or h <= 0:
            continue
        x = max(0, min(IMG_W - 1, x)); y = max(0, min(IMG_H - 1, y))
        w = min(w, IMG_W - x); h = min(h, IMG_H - y)
        if w < 18 or h < 18:
            continue
        builds.append({"x": int(x), "y": int(y), "w": int(w), "h": int(h)})
    street = []
    for p in (data.get("street") or [])[:60]:
        try:
            street.append([max(0, min(IMG_W, float(p[0]))), max(0, min(IMG_H, float(p[1])))])
        except Exception:
            pass
    lm = data.get("landmarks") or {}

    def pt(k):
        v = lm.get(k)
        try:
            return [max(0, min(IMG_W, float(v[0]))), max(0, min(IMG_H, float(v[1])))]
        except Exception:
            return [0, 0]
    river = (data.get("river") or {}).get("bbox") or [0, 0, 0, 0]
    try:
        river = [max(0, min(IMG_W, float(river[0]))), max(0, min(IMG_H, float(river[1]))),
                 max(0, min(IMG_W, float(river[2]))), max(0, min(IMG_H, float(river[3])))]
    except Exception:
        river = [0, 0, 0, 0]
    return {"regions": regions, "buildings": builds, "street": street,
            "landmarks": {k: pt(k) for k in
                          ("well", "temple", "school", "communal_field", "threshing_yard")},
            "river": {"bbox": river}}


def main():
    if not os.path.exists(SRC):
        print("没有 work/base_clean.jpg，先跑 gen_map.py --pick N 与 clean.py")
        return
    out = os.path.join(WORK, "regions.json")
    if os.path.exists(out) and "--force" not in sys.argv:
        print("已有 work/regions.json（加 --force 重读）")
        data = json.load(io.open(out, encoding="utf-8"))
    else:
        print("读图中…")
        raw = mmapi.wait_retry(lambda: mmapi.chat_json(PROMPT, SRC, max_tokens=6000))
        data = norm(raw)
        with io.open(out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        with io.open(os.path.join(WORK, "regions.raw.json"), "w", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False, indent=1)
    print("九格：")
    for r in range(3):
        for c in range(3):
            print("  r%dc%d  %s" % (r, c, data["regions"].get("%d_%d" % (r, c), "—")))
    print("院落框 %d 个；主街 %d 点；地点：%s"
          % (len(data["buildings"]), len(data["street"]),
             {k: v for k, v in data["landmarks"].items()}))

    if "--show" in sys.argv:
        from PIL import Image, ImageDraw
        im = Image.open(SRC).convert("RGB")
        d = ImageDraw.Draw(im)
        for b in data["buildings"]:
            d.rectangle([b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]],
                        outline=(200, 40, 30), width=3)
        for p in data["street"]:
            d.ellipse([p[0] - 6, p[1] - 6, p[0] + 6, p[1] + 6], fill=(30, 90, 200))
        for k, p in data["landmarks"].items():
            d.ellipse([p[0] - 16, p[1] - 16, p[0] + 16, p[1] + 16], outline=(20, 150, 60), width=5)
        im.resize((1400, 930), Image.LANCZOS).save(os.path.join(WORK, "_regions.jpg"), quality=88)
        print("已画 work/_regions.jpg")


if __name__ == "__main__":
    main()
