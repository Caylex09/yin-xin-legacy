#!/usr/bin/env python3
"""
Convert raw poet and poetry data under old-data/ into normalized JSON files.

Outputs:
- data/poets.json
- data/poetry.json
- data/avatar/* (copied or placeholder avatars)
"""
import base64
import csv
import json
import random
import re
import shutil
import string
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OLD_DATA = ROOT / "old-data"
DATA_DIR = ROOT / "data"
POET_DIR = OLD_DATA / "poet"
POETRY_DIR = OLD_DATA / "poetry"
AVATAR_SRC_DIR = OLD_DATA / "avatar"
AVATAR_DST_DIR = DATA_DIR / "avatar"

RANDOM_CHARS = string.ascii_letters + string.digits
DEFAULT_AVATAR_BYTES = base64.b64decode(
    b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAusB9zZZr68AAAAASUVORK5CYII="
)

random.seed(42)
used_ids: set[str] = set()


def generate_id() -> str:
    """Generate a unique 8-character alphanumeric id."""
    while True:
        candidate = "".join(random.choices(RANDOM_CHARS, k=8))
        if candidate not in used_ids:
            used_ids.add(candidate)
            return candidate


def ensure_default_avatar() -> str:
    """Ensure the placeholder avatar exists and return its relative path."""
    AVATAR_DST_DIR.mkdir(parents=True, exist_ok=True)
    placeholder = AVATAR_DST_DIR / "yinxin.png"
    if not placeholder.exists():
        placeholder.write_bytes(DEFAULT_AVATAR_BYTES)
    return "avatar/yinxin.png"


def ensure_avatar(image_field: str | None) -> str:
    """
    Copy the avatar file into data/avatar and return the relative path.
    If the expected file is missing, fall back to the placeholder.
    """
    if image_field:
        avatar_name = Path(image_field).name
        src_path = AVATAR_SRC_DIR / avatar_name
        if src_path.exists():
            AVATAR_DST_DIR.mkdir(parents=True, exist_ok=True)
            dst_path = AVATAR_DST_DIR / avatar_name
            if not dst_path.exists():
                shutil.copyfile(src_path, dst_path)
            return f"avatar/{avatar_name}"
    return ensure_default_avatar()


def load_poets():
    """Load existing poet files and normalize the schema."""
    poets: list[dict] = []
    name_to_id: dict[str, str] = {}
    numeric_to_id: dict[str, str] = {}

    poet_files = sorted(
        POET_DIR.glob("poet_*.json"),
        key=lambda p: int(p.stem.split("_")[1]) if "_" in p.stem else 0,
    )

    for path in poet_files:
        with path.open(encoding="utf-8") as f:
            raw = json.load(f)

        poet_id = generate_id()
        avatar_path = ensure_avatar(raw.get("image"))
        name = raw.get("name", "").strip() or "佚名"

        poet_entry = {
            "id": poet_id,
            "name": name,
            "dynasty": raw.get("dynasty", "").strip(),
            "description": raw.get("desc", "").strip(),
            "content": (raw.get("content") or "").strip(),
            "avatar": avatar_path,
            "star": 0,
        }

        poets.append(poet_entry)
        if "id" in raw:
            numeric_to_id[str(raw["id"])] = poet_id
        if name not in name_to_id:
            name_to_id[name] = poet_id

    return poets, name_to_id, numeric_to_id


def split_sentences(text: str) -> list[str]:
    """Split content into sentences by common Chinese punctuation."""
    cleaned = (text or "").replace("\r", "").replace("\n", "").strip()
    if not cleaned:
        return []
    parts = re.split(r"(?<=[。！？!?:；;…])\s*", cleaned)
    sentences = [p.strip() for p in parts if p and p.strip()]
    return sentences or [cleaned]


def ensure_author(name: str, dynasty: str, poets: list[dict], name_to_id: dict[str, str]) -> str:
    """Ensure an author exists and return its id, creating a stub if needed."""
    safe_name = name.strip() or "佚名"
    if safe_name in name_to_id:
        return name_to_id[safe_name]

    poet_id = generate_id()
    poet_entry = {
        "id": poet_id,
        "name": safe_name,
        "dynasty": dynasty.strip(),
        "description": "",
        "content": "",
        "avatar": ensure_default_avatar(),
        "star": 0,
    }

    poets.append(poet_entry)
    name_to_id[safe_name] = poet_id
    return poet_id


def load_poetry(name_to_id: dict[str, str], poets: list[dict]) -> list[dict]:
    """Load and normalize poetry CSV files."""
    poetry: list[dict] = []
    csv_files = sorted(POETRY_DIR.glob("*.csv"))

    for csv_path in csv_files:
        with csv_path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                title = (row.get("标题") or "").strip()
                dynasty = (row.get("朝代") or "").strip()
                author_name = (row.get("作者") or "").strip()
                genre = (row.get("体裁") or "").strip()
                content_raw = row.get("内容") or ""

                author_id = ensure_author(author_name, dynasty, poets, name_to_id)
                tags = []
                if genre:
                    tags.append(genre)
                if dynasty:
                    tags.append(dynasty)
                # keep insertion order while removing duplicates
                tags = list(dict.fromkeys(tags))

                poem_entry = {
                    "id": generate_id(),
                    "about": "",
                    "content": split_sentences(content_raw),
                    "translation": "",
                    "title": title,
                    "author": author_id,
                    "appreciation": "",
                    "star": 0,
                    "tags": tags,
                }
                poetry.append(poem_entry)

    return poetry


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    poets, name_to_id, _ = load_poets()
    poetry = load_poetry(name_to_id, poets)

    def write_ndjson(path: Path, items: list[dict]):
        with path.open("w", encoding="utf-8") as f:
            for obj in items:
                f.write(json.dumps(obj, ensure_ascii=False))
                f.write("\n")

    (DATA_DIR / "poets.json").write_text(
        json.dumps(poets, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (DATA_DIR / "poetry.json").write_text(
        json.dumps(poetry, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_ndjson(DATA_DIR / "poets.ndjson", poets)
    write_ndjson(DATA_DIR / "poetry.ndjson", poetry)
    print(f"Wrote {len(poets)} poets to data/poets.json")
    print(f"Wrote {len(poetry)} poems to data/poetry.json")
    print("Also wrote NDJSON: data/poets.ndjson, data/poetry.ndjson")


if __name__ == "__main__":
    main()

