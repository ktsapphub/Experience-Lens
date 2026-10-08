"""Regenerate tests/fixtures/expected.json by running the ORIGINAL FastAPI code (backend/server.py)
on tests/fixtures/inputs.json. The Node parity test (tests/parity.test.js) then checks the Worker
against that output. Only needed when fixtures change:

    pip install fastapi motor passlib bcrypt==4.1.3 pyjwt httpx email-validator python-dotenv
    python3 tests/generate_expected.py
"""
import asyncio
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ.update(MONGO_URL="mongodb://localhost:1", DB_NAME="parity", JWT_SECRET="x" * 40, GOOGLE_PLACES_API_KEY="k")

import server  # noqa: E402  (the old backend)

inputs = json.loads((ROOT / "tests/fixtures/inputs.json").read_text())


def photo_name(url):
    return server._extract_photo_name(url)


def norm_place(p):
    d = p.model_dump()
    d["photos"] = [{**ph, "url": photo_name(ph["url"])} for ph in d["photos"]]
    return d


def lookup(query):
    for cat, kw in server.DEFAULT_CATEGORY_KEYWORDS.items():
        if query.startswith(kw):
            return inputs["google"].get(f"{cat}{query[len(kw):]}", [])
    return inputs["google"].get(query, [])


async def fake_google(_client, query):
    return lookup(query)


async def fake_scrape(_client, url):
    html = inputs["html"].get(url)
    return server.parse_instagram_handle(html) if html else None


async def noop(*a, **k):
    return None


server._google_text_search = fake_google
server.scrape_instagram_from_website = fake_scrape
server._persist_search_history = noop

out = {"searches": [], "validation": [], "instagram": [], "export_csv": None}

for case in inputs["searches"]:
    resp = asyncio.run(server.search_places(server.SearchRequest(**case["body"])))
    out["searches"].append({"name": case["name"], "response": {**resp.model_dump(), "places": [norm_place(p) for p in resp.places]}})

for case in inputs["validation"]:
    try:
        server._normalize_search_request(server.SearchRequest(**case["body"]))
        out["validation"].append({"name": case["name"], "status": 200})
    except server.HTTPException as e:
        out["validation"].append({"name": case["name"], "status": e.status_code, "detail": e.detail})

out["instagram"] = [server.parse_instagram_handle(h) for h in inputs["instagramSamples"]]

places = [server.PlaceResult(**p) for p in inputs["exportPlaces"]]


async def export_csv():
    resp = await server.export_places_to_csv(places)
    return "".join([c if isinstance(c, str) else c.decode() async for c in resp.body_iterator])


out["export_csv"] = asyncio.run(export_csv())

cfg = asyncio.run(server.get_config())
out["config"] = {"protocol": cfg["protocol"], "categories": cfg["categories"]}
out["categories"] = asyncio.run(server.get_categories())
out["regions"] = asyncio.run(server.get_regions())

(ROOT / "tests/fixtures/expected.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
print("wrote tests/fixtures/expected.json")
