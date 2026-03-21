import os
import re

pages_dir = r"d:\yin-xin\frontend\src\pages"
categories = ["Announcement", "Discussion", "Ticket"]

for cat in categories:
    target_dir = os.path.join(pages_dir, cat.lower())
    os.makedirs(target_dir, exist_ok=True)

    files = [
        f for f in os.listdir(pages_dir) if f.startswith(cat) and f.endswith(".tsx")
    ]

    for f in files:
        src_path = os.path.join(pages_dir, f)
        target_path = os.path.join(target_dir, f)

        # Read with utf-8
        with open(src_path, "r", encoding="utf-8") as file:
            content = file.read()

        # Replace imports: `from "../something"` -> `from "../../something"`
        new_content = re.sub(
            r"from\s+[\'\"]\.\./([\w/]+)[\'\"]", r'from "../../\1"', content
        )
        # Note: replace usePageTitle from "../../hooks/usePageTitle" if it was `from "../hooks/usePageTitle"`
        # The above regex only catches `../word` not `../word/word`.
        # Better:
        new_content = re.sub(
            r"from\s+[\'\"]\.\./(.*?)[\'\"]", r'from "../../\1"', content
        )

        # Write to new destination
        with open(target_path, "w", encoding="utf-8") as file:
            file.write(new_content)

        # Remove old file
        os.remove(src_path)

print("Done!")
