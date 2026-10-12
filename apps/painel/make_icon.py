#!/usr/bin/env python3
"""Draw the Painel icon (landscape photo frame with a clock) and write icon.png (80) and largeIcon.png (130)."""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
S = 520  # draw large, downscale for smooth edges


def draw() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = Image.new("RGBA", (S, S))
    top, bottom = (56, 189, 248), (30, 64, 175)  # sky
    for y in range(S):
        t = y / (S - 1)
        bg.paste(tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,), (0, y, S, y + 1))
    d = ImageDraw.Draw(bg)
    d.ellipse((330, 70, 430, 170), fill=(253, 224, 71))                           # sun
    d.polygon([(0, 400), (150, 230), (300, 400)], fill=(21, 128, 61))            # mountains
    d.polygon([(170, 400), (340, 200), (520, 400)], fill=(22, 101, 52))
    d.rectangle((0, 390, S, S), fill=(15, 23, 42))                                # ground / info bar
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=110, fill=255)
    img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)
    # clock on the info bar
    cx, cy, r = 130, 455, 44
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(241, 245, 249), width=12)
    d.line([(cx, cy), (cx, cy - 26)], fill=(241, 245, 249), width=11)
    d.line([(cx, cy), (cx + 20, cy + 8)], fill=(241, 245, 249), width=11)
    # "agenda" lines
    for i, w in enumerate((250, 190)):
        y = 432 + i * 42
        d.rounded_rectangle((210, y, 210 + w, y + 18), radius=9, fill=(148, 163, 184))
    return img


if __name__ == "__main__":
    big = draw()
    for name, size in [("icon.png", 80), ("largeIcon.png", 130)]:
        big.resize((size, size), Image.LANCZOS).save(HERE / name)
        print("wrote", name, size)
