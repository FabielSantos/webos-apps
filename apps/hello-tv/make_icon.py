#!/usr/bin/env python3
"""Draw the Hello TV icon (TV with a check mark) and write icon.png (80) and largeIcon.png (130)."""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
S = 520  # draw large, downscale for smooth edges


def draw() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # vertical gradient background in a rounded square
    bg = Image.new("RGBA", (S, S))
    top, bottom = (30, 58, 138), (15, 23, 42)
    for y in range(S):
        t = y / (S - 1)
        bg.paste(tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,), (0, y, S, y + 1))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=110, fill=255)
    img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)
    # TV body, screen, stand
    d.rounded_rectangle((70, 110, 450, 380), radius=34, fill=(241, 245, 249))
    d.rounded_rectangle((98, 136, 422, 354), radius=18, fill=(0, 200, 110))
    d.rounded_rectangle((235, 380, 285, 420), radius=6, fill=(241, 245, 249))
    d.rounded_rectangle((170, 412, 350, 438), radius=13, fill=(241, 245, 249))
    # check mark on the screen
    d.line([(190, 248), (240, 298), (335, 192)], fill=(15, 23, 42), width=34, joint="curve")
    for x, y in [(190, 248), (335, 192)]:
        d.ellipse((x - 17, y - 17, x + 17, y + 17), fill=(15, 23, 42))
    return img


if __name__ == "__main__":
    big = draw()
    for name, size in [("icon.png", 80), ("largeIcon.png", 130)]:
        big.resize((size, size), Image.LANCZOS).save(HERE / name)
        print("wrote", name, size)
