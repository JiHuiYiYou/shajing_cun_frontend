# -*- coding: utf-8 -*-
"""生成十六张人物立绘（透明底 PNG）。

    python tools/mapgen/gen_char.py --list        # 看选池结果与 prompt 配料
    python tools/mapgen/gen_char.py --dry-run 3   # 打印第 3 号的 prompt
    python tools/mapgen/gen_char.py               # 生成（已存在的跳过）

选池规则（写在下面，可复核）
  1. 必选：五处地点的当事人（app.js 的 PLACE_P）+ 十二个月承办人（MONTH_ACTOR）
  2. 再按「每族一个宗长」补齐，取到 16 人为止
  3. 仍不足 16，按经营亩数从多到少补

立绘是离线产物，随仓库提交；浏览器只读文件，不现画。
"""
import io
import io as _io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mmapi
import style
from PIL import Image

ROOT = style.ROOT
OUT = os.path.join(ROOT, "assets", "char")
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "work", "char_raw")
POOL_N = 16

# app.js 的 PLACE_P / MONTH_ACTOR —— 与那边同一批人
PLACE_P = ["1", "1", "53", "49", "52"]
MONTH_ACTOR = {1: "39", 2: "53", 3: "32", 4: "49", 5: "1", 6: "1",
               7: "1", 8: "39", 9: "1", 10: "4", 11: "49", 12: "3"}

# 职业 -> 衣着道具
DRESS = {
    "农（医师）": "青布长衫，手提药箱",
    "农（看青）": "粗布短褂，肩搭竹哨",
    "农（做烧饼）": "白围裙，油渍布衫",
    "农（阴阳先生）": "灰布长衫，头戴瓜皮帽",
    "农（教员）": "蓝布长衫腋下夹着书册",
    "农（商）": "深色长袍马褂，腰间挂着算盘",
    "农（车辆运输）": "短打束腰，肩搭粗麻绳",
    "农": "靛蓝粗布短褂，裤脚卷起",
    "木匠": "靛蓝对襟褂，卷袖，手上有木屑",
    "铁匠（农）": "厚实短褂，系皮围裙，袖口油亮",
    "手艺（五金修理）": "短打，肩上搭着钳子",
    "商（北京）": "长袍马褂，手提算盘与钱袋",
    "赶驴马（短工）": "粗麻短打，赤脚，草鞋",
    "交通公司人员（寄居）": "中山装，手提公文包",
    "乞讨": "破旧衣衫，拄一根竹杖",
    "手艺人": "短打，腰间挂工具",
}
DEFAULT_DRESS = "粗布短褂，裤脚卷起，草鞋"


def load_data():
    src = io.open(os.path.join(ROOT, "assets", "js", "data.js"), encoding="utf-8").read()
    m = re.search(r"const DATA = (\{.*\});", src, re.S)
    return json.loads(m.group(1))


def age_bucket(age):
    try:
        a = int(re.sub(r"\D", "", age) or 0)
    except Exception:
        a = 40
    if a < 16:
        return "未及束发之年"
    if a < 20:
        return "弱冠少年"
    if a < 35:
        return "青年"
    if a < 50:
        return "壮年"
    if a < 62:
        return "中年"
    return "花甲老者"


def is_female(name):
    return "氏" in name


def dress_of(job):
    job = (job or "").strip()
    if job in DRESS:
        return DRESS[job]
    for k, v in DRESS.items():
        if k and k in job:
            return v
    return DEFAULT_DRESS


def build_pool(data):
    hh = {h["no"]: h for h in data["households"]}
    must, why = [], {}

    def add(no, w):
        if no not in must and len(must) < POOL_N:
            must.append(no)
            why[no] = w

    for no in PLACE_P:
        add(no, "地点当事人")
    for no in MONTH_ACTOR.values():
        add(no, "月度承办人")

    # 每族一个宗长：取该族经营亩数最多者，同数取序号小者
    clans = {}
    for h in data["households"]:
        c = h.get("clanG") or "其他"
        m = h.get("manageN")
        key = (-(m if m is not None else 0), int(h["no"]))
        if c not in clans or key < clans[c][0]:
            clans[c] = (key, h["no"])
    # 同族里若有职业更别致的，换他——十六个人不能全是「农」
    by_clan = {}
    for h in data["households"]:
        by_clan.setdefault(h.get("clanG") or "其他", []).append(h)
    used_jobs = set()
    for no in must:
        j = (hh[no].get("job") or "").strip()
        if j:
            used_jobs.add(j)

    def job_key(h):
        j = (h.get("job") or "").strip()
        distinct = 0 if j in used_jobs else 1
        m = h.get("manageN")
        return (-distinct, -(m if m is not None else 0), int(h["no"]))

    for c in sorted(clans, key=lambda c: clans[c][0]):
        if len(must) >= POOL_N:
            break
        cands = sorted(by_clan.get(c, []), key=job_key)
        if not cands:
            continue
        h = cands[0]
        add(h["no"], "%s 族宗长" % c)
        j = (h.get("job") or "").strip()
        if j:
            used_jobs.add(j)
    # 仍不足：按经营亩数补，但优先补职业别致的
    if len(must) < POOL_N:
        rest = sorted([h for h in data["households"] if h["no"] not in must],
                      key=job_key)
        for h in rest:
            if len(must) >= POOL_N:
                break
            add(h["no"], "大户")
            j = (h.get("job") or "").strip()
            if j:
                used_jobs.add(j)
    return [n for n in must[:POOL_N]], why


def char_prompt(h):
    female = is_female(h["name"])
    age = age_bucket(h.get("age"))
    dress = dress_of(h.get("job"))
    job = (h.get("job") or "农").strip()
    look = (h.get("look") or "").strip()
    note = (h.get("note") or "").strip()

    # 年纪要在人身上看得出：老的拄杖、少年的赤脚、壮年的结实
    a = h.get("age")
    try:
        ay = int(re.sub(r"\D", "", a) or 0)
    except Exception:
        ay = 40
    if ay >= 62:
        dress += "，拄一根竹杖，背已微驼"
    elif ay < 20:
        dress += "，赤脚，个头未长成"
    elif ay < 35:
        dress += "，身板结实挺直"
    if female:
        dress += "，挽起发髻"

    extra = []
    if look:
        extra.append("形貌：" + look[:40])
    elif note:
        # note 里有转录截断标记，去掉再取短句
        n = re.sub(r"[【】]", "", note)
        extra.append("身份：" + n[:36])
    extra_s = ("；" + "；".join(extra)) if extra else ""
    return (
        "民国时期中国南方乡村的%s，%s，%s（%s）。%s。"
        "全身立绘，正面站姿，双手自然垂下，站姿安稳，视线平视。"
        "%s。\n\n%s\n%s"
        % ("女子" if female else "男子",
           age,
           dress,
           job,
           "面容清癯，神色沉静" if female else "面容敦厚，神色平和",
           extra_s,
           style.CHAR_STYLE,
           style.CHAR_NEG)
    )


PAPER = (233, 222, 196)      # 纸
INK = (30, 26, 18)           # 墨
SEAL = (165, 49, 29)         # 朱砂


def _bg_mask(im):
    """找出纸底区域：亮而低饱和的那些像素。

    人物是墨线与淡彩，纸底是浅米黄——明度高、彩度低，
    这两条件一夹，纸底与人物分得很干净：
    肤色的彩度够高（不进底），墨线的明度够低（不进底）。
    """
    import numpy as np
    a = np.asarray(im).astype(np.float32)
    lum = a[:, :, 0] * 0.299 + a[:, :, 1] * 0.587 + a[:, :, 2] * 0.114
    sat = a.max(axis=2) - a.min(axis=2)
    return (lum > 205) & (sat < 34)


def inkify(rgb, strength=0.40):
    """把人物拉回舆图的调子：明度做双色（纸 -> 墨），再按比例混回原色。

    模型画人物容易跑成彩色游戏立绘，跟水墨舆图不是一路。
    双色映射保住了墨分五色的调子，又不至于把人画得看不出是谁，
    所以只混四成，剩下六成留给原画。
    """
    import numpy as np
    a = np.asarray(rgb).astype(np.float32)
    lum = a[:, :, 0] * 0.299 + a[:, :, 1] * 0.587 + a[:, :, 2] * 0.114
    lo, hi = np.percentile(lum, 2), np.percentile(lum, 98)
    if hi - lo < 1:
        hi = lo + 1
    t = np.clip((lum - lo) / (hi - lo), 0, 1)
    duo = (np.array(PAPER, dtype=np.float32)[None, None, :] * (1 - t[:, :, None]) +
           np.array(INK, dtype=np.float32)[None, None, :] * t[:, :, None])
    # 原色里偏朱砂的（红明显高于蓝）留一点朱砂
    red = np.clip((a[:, :, 0] - a[:, :, 2]) / 60.0, 0, 1) * t
    duo = duo * (1 - red[:, :, None] * 0.45) + \
        np.array(SEAL, dtype=np.float32)[None, None, :] * (red[:, :, None] * 0.45)
    out = a * (1 - strength) + duo * strength
    return np.clip(out, 0, 255).astype(np.uint8)


_REMBG = None


def rembg_cut(blob):
    """用 rembg（u2net）去底。纸底有斑驳、水渍，它照样分得清。"""
    global _REMBG
    try:
        from rembg import remove, new_session
    except Exception:
        return None
    if _REMBG is None:
        _REMBG = new_session("u2net")
    try:
        out = remove(blob, session=_REMBG)
        return Image.open(_io.BytesIO(out)).convert("RGBA")
    except Exception as e:
        print("  ! rembg 失败：%s" % e)
        return None


def key_background(blob, height=256, ink_strength=0.40):
    """去底 -> 裁到人物 -> 统一墨色 -> 缩放。返回 (png 字节, PIL 图)。

    先用 rembg：模型给的纸底有时带斑驳、有水渍，按颜色阈值分不干净，
    rembg 是真抠图，什么底都吃得下。
    抠不出来时才退回按颜色去底。
    """
    import numpy as np
    from PIL import Image, ImageFilter
    import io as _io

    out = rembg_cut(blob)
    if out is None:
        im = Image.open(_io.BytesIO(blob)).convert("RGB")
        mask = _bg_mask(im)
        if not mask.any():
            raise RuntimeError("没找到纸底")
        a = np.asarray(im).copy()
        rgb = inkify(a, ink_strength)
        # alpha：纸底为 0。中值滤波去掉纸纹造成的碎斑，
        # 再做一次开运算（先腐蚀后膨胀）把零星墨点去掉，最后羽化边缘。
        alpha = Image.fromarray((~mask).astype(np.uint8) * 255, "L")
        alpha = alpha.filter(ImageFilter.MedianFilter(5))
        fg = alpha.point(lambda v: 255 if v > 40 else 0)
        fg = fg.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
        alpha = fg.filter(ImageFilter.GaussianBlur(0.7))
        rgba = np.dstack([rgb, np.asarray(alpha)])
        out = Image.fromarray(rgba, "RGBA")
    else:
        # rembg 出来的是原色，再统一一次墨调
        a = np.asarray(out.convert("RGB"))
        rgb = inkify(a, ink_strength)
        al = np.asarray(out.split()[-1]).astype(np.float32)
        # rembg 有时会给人影旁边留一片半透明的「纸影」，
        # 人物边上就多出一块灰方框。把低透明的一刀切掉。
        al = np.clip((al - 120.0) * 255.0 / 60.0, 0, 255).astype(np.uint8)
        a2 = np.dstack([rgb, al])
        out = Image.fromarray(a2, "RGBA")

    bbox = out.getbbox()
    if not bbox:
        raise RuntimeError("去背后全透明")
    out = out.crop(bbox)
    w = max(1, round(out.width * (float(height) / out.height)))
    out = out.resize((w, height), Image.LANCZOS)
    buf = _io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue(), out


def main():
    data = load_data()
    hh = {h["no"]: h for h in data["households"]}
    pool, why = build_pool(data)

    if "--list" in sys.argv:
        print("选池 %d 人：" % len(pool))
        for no in pool:
            h = hh[no]
            print("  %-3s %-8s %-3s %-12s %-9s  %s" %
                  (no, h["name"], h["age"], h.get("job") or "-", h.get("clanG") or "-",
                   why.get(no, "")))
        return

    if "--dry-run" in sys.argv:
        i = int(sys.argv[sys.argv.index("--dry-run") + 1])
        no = pool[i]
        print("=== %s %s ===" % (no, hh[no]["name"]))
        print(char_prompt(hh[no]))
        return

    os.makedirs(OUT, exist_ok=True)
    os.makedirs(RAW, exist_ok=True)
    rekey = "--rekey" in sys.argv      # 用已有的原图重做去背/上墨，不再花钱
    for i, no in enumerate(pool):
        dst = os.path.join(OUT, "%s.png" % no)
        if not rekey and os.path.exists(dst) and os.path.getsize(dst) > 0:
            print("  已存在，跳过 %s" % no)
            continue
        raw = os.path.join(RAW, "%s.jpg" % no)
        h = hh[no]
        print("[%d/%d] %s %s …" % (i + 1, len(pool), no, h["name"]))
        if os.path.exists(raw) and os.path.getsize(raw) > 0:
            with open(raw, "rb") as f:
                blob = f.read()
        else:
            blob, _ = mmapi.wait_retry(
                lambda: mmapi.generate(char_prompt(h), style.CHAR_SIZE, n=1,
                                       quality=94, fmt="jpeg")[0])
            mmapi.save(raw, blob)
        try:
            png, im = key_background(blob)
        except Exception as e:
            print("  ! 去背失败：%s（原始图留在 %s）" % (e, raw))
            continue
        mmapi.save(dst, png)
        print("    落盘 %s（%dx%d，%d 字节）" %
              (os.path.relpath(dst, ROOT), im.width, im.height, len(png)))

    with io.open(os.path.join(OUT, "pool.json"), "w", encoding="utf-8") as f:
        json.dump({"pool": pool, "why": why}, f, ensure_ascii=False, indent=1)
    print("\n选池写入 assets/char/pool.json")


if __name__ == "__main__":
    main()
