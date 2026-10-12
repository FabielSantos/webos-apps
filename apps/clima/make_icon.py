#!/usr/bin/env python3
"""Draw the Clima icon (sun behind a cloud) and write icon.png (80) and largeIcon.png (130)."""
import math
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
S = 520  # draw large, downscale for smooth edges


def draw() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = Image.new("RGBA", (S, S))
    top, bottom = (14, 116, 144), (12, 30, 66)
    for y in range(S):
        t = y / (S - 1)
        bg.paste(tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,), (0, y, S, y + 1))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=110, fill=255)
    img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)
    # sun with rays (upper left)
    cx, cy, r = 205, 200, 78
    for i in range(8):
        a = i * math.pi / 4
        x1, y1 = cx + math.cos(a) * (r + 22), cy + math.sin(a) * (r + 22)
        x2, y2 = cx + math.cos(a) * (r + 62), cy + math.sin(a) * (r + 62)
        d.line([(x1, y1), (x2, y2)], fill=(251, 191, 36), width=26)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(251, 191, 36))
    # cloud (lower right): base pill + three bumps
    white = (241, 245, 249)
    d.rounded_rectangle((150, 300, 440, 410), radius=55, fill=white)
    d.ellipse((185, 245, 305, 365), fill=white)
    d.ellipse((260, 195, 410, 345), fill=white)
    d.ellipse((350, 270, 450, 370), fill=white)
    return img


if __name__ == "__main__":
    big = draw()
    for name, size in [("icon.png", 80), ("largeIcon.png", 130)]:
        big.resize((size, size), Image.LANCZOS).save(HERE / name)
        print("wrote", name, size)
