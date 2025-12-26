from pathlib import Path


def main():
    base = Path(__file__).resolve().parent
    src = base / "data" / "poetry.ndjson"
    chunk = 100_000
    buf: list[str] = []
    idx = 0

    with src.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            buf.append(line)
            if line_no % chunk == 0:
                out = base / "data" / f"poetry_part_{idx}.ndjson"
                out.write_text("".join(buf), encoding="utf-8")
                buf.clear()
                idx += 1

    if buf:
        out = base / "data" / f"poetry_part_{idx}.ndjson"
        out.write_text("".join(buf), encoding="utf-8")
        idx += 1

    print(f"Split into {idx} files, chunk size {chunk}")


if __name__ == "__main__":
    main()

