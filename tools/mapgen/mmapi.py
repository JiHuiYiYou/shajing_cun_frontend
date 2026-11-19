# -*- coding: utf-8 -*-
"""MiniMax H3-Image 调用层。

    python tools/mapgen/gen_map.py --dry-run     # 只打印 prompt，不花钱
    python tools/mapgen/gen_map.py               # 出 4 张粗图候选

要点
  * 密钥与 base_url 从 C:\\Users\\liuzhen\\.mmx\\config.json 读，不另存一份。
  * H3-Image 没有 seed：同一 prompt 重跑结果不同。
    所以每次出图必须落盘缓存，脚本据此断点续跑，绝不重复烧钱。
  * 返回的 url 只活 24 小时，必须当场下载落盘。
  * 走 API 而不是 mmx-cli：mmx-cli 的 image generate 只支持 image-01，
    没有 H3-Image 的 /v1/images/edits 参考图接口。
"""
import base64
import io
import json
import os
import sys
import time

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join(ROOT, "tools", "mapgen", "work")
CONFIG = os.path.join(os.path.expanduser("~"), ".mmx", "config.json")

MODEL = "MiniMax-H3-Image"
HOSTS = ["https://api.minimaxi.com", "https://api.minimax.cn"]


def _conf():
    with io.open(CONFIG, encoding="utf-8") as f:
        c = json.load(f)
    return c.get("api_key") or c.get("apiKey") or "", c.get("base_url") or ""


KEY, _BASE = _conf()


def _host():
    """优先用 mmx 配置里的 base_url，失败再退另一个 host。"""
    return [_BASE] + [h for h in HOSTS if h != _BASE]


def _post(path, payload, timeout=600):
    last = None
    for base in _host():
        if not base:
            continue
        try:
            r = requests.post(base.rstrip("/") + path, headers={
                "Authorization": "Bearer " + KEY,
                "Content-Type": "application/json",
            }, json=payload, timeout=timeout)
        except Exception as e:                       # 网络抖动，换 host 再试
            last = e
            continue
        if r.status_code == 200:
            return r.json()
        try:
            err = r.json().get("error", {})
        except Exception:
            err = {"message": r.text[:300]}
        # 402/403/401 是账号或额度问题，换 host 也没用，直接抛
        if r.status_code in (400, 401, 402, 403, 422):
            raise RuntimeError("HTTP %d %s" % (r.status_code, err))
        last = RuntimeError("HTTP %d %s" % (r.status_code, err))
    raise last or RuntimeError("全部 host 均失败")


def generate(prompt, size, n=1, quality=92, fmt="jpeg"):
    """文生图。返回 [(bytes, revised_prompt), ...]。"""
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "size": size,
        "n": n,
        "response_format": "url",
        "output_format": fmt,
        "output_compression": quality,
    }
    data = _post("/v1/images/generations", payload)
    out = []
    for i, item in enumerate(data.get("data", [])):
        if "error" in item:
            print("  ! 第 %d 张失败：%s" % (i, item["error"]))
            continue
        out.append((_download(item["url"]), item.get("revised_prompt", "")))
    if not out:
        raise RuntimeError("全部生成失败")
    return out


def edit(prompt, images, size, quality=92, fmt="jpeg"):
    """图片编辑：images = [bytes, ...] 或 [data-uri-str, ...]。"""
    refs = []
    for im in images:
        if isinstance(im, (bytes, bytearray)):
            refs.append({"image_url": "data:image/png;base64," +
                         base64.b64encode(im).decode("ascii")})
        else:
            refs.append({"image_url": im})
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "images": refs,
        "size": size,
        "n": 1,
        "response_format": "url",
        "output_format": fmt,
        "output_compression": quality,
    }
    data = _post("/v1/images/edits", payload)
    for item in data.get("data", []):
        if "error" in item:
            raise RuntimeError("编辑失败：%s" % item["error"])
        return _download(item["url"]), item.get("revised_prompt", "")
    raise RuntimeError("编辑无返回")


def _download(url):
    r = requests.get(url, timeout=300)
    r.raise_for_status()
    return r.content


def save(path, blob):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(blob)
    return path


def cached(path, producer):
    """有文件就用文件，没有就生成并落盘。断点续跑靠它。"""
    if os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, "rb") as f:
            return f.read()
    blob = producer()
    save(path, blob)
    return blob


def chat_json(prompt, image_path=None, max_tokens=4000):
    """拿多模态模型读图，吐 JSON。"""
    content = [{"type": "text", "text": prompt}]
    if image_path:
        with open(image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        content.append({"type": "image_url",
                        "image_url": {"url": "data:image/jpeg;base64," + b64}})
    payload = {
        "model": "MiniMax-M3.1-Flash",
        "messages": [{"role": "user", "content": content}],
        "max_completion_tokens": max_tokens,
        "reasoning_effort": "low",
        "stream": False,
    }
    data = _post("/v1/chat/completions", payload)
    txt = data["choices"][0]["message"].get("content") or ""
    return _extract_json(txt)


def _extract_json(txt):
    """模型常在 JSON 外面裹 markdown 围栏或解说，抠出第一段完整 JSON。"""
    t = txt.strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1]
        if t.startswith("json"):
            t = t[4:]
    t = t.strip()
    try:
        return json.loads(t)
    except Exception:
        pass
    for op, cl in (("{", "}"), ("[", "]")):
        i = t.find(op)
        if i < 0:
            continue
        depth = 0
        for j in range(i, len(t)):
            if t[j] == op:
                depth += 1
            elif t[j] == cl:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(t[i:j + 1])
                    except Exception:
                        break
    raise RuntimeError("模型没吐可解析的 JSON：\n" + txt[:600])


def wait_retry(fn, tries=3, delay=8):
    last = None
    for i in range(tries):
        try:
            return fn()
        except Exception as e:
            last = e
            msg = str(e)
            # 内容安全 / 额度 / 参数问题重试没用
            if any(k in msg for k in ("1026", "1027", "1008", "2053", "2067", "2068", "2013", "400")):
                raise
            print("  … 第 %d 次失败（%s），%d 秒后重试" % (i + 1, msg[:120], delay))
            time.sleep(delay)
    raise last


if __name__ == "__main__":
    print("key:", KEY[:6] + "…" + KEY[-4:], " host:", _BASE or HOSTS[0])
    print("model:", MODEL)
