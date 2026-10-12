#!/usr/bin/env python3
"""Draw the Rádios icon (vintage radio with sound waves) and write icon.png (80) and largeIcon.png (130)."""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
S = 520  # draw large, downscale for smooth edges


def draw() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = Image.new("RGBA", (S, S))
    top, bottom = (234, 88, 12), (124, 45, 18)
    for y in range(S):
        t = y / (S - 1)
        bg.paste(tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,), (0, y, S, y + 1))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=110, fill=255)
    img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)
    cream, dark = (255, 247, 237), (67, 20, 7)
    d.line([(150, 175), (330, 95)], fill=cream, width=14)                     # antenna
    d.rounded_rectangle((70, 170, 450, 420), radius=40, fill=cream)           # body
    d.ellipse((105, 215, 265, 375), fill=dark)                                # speaker
    for r in (55, 30):
        d.ellipse((185 - r, 295 - r, 185 + r, 295 + r), outline=(251, 146, 60), width=10)
    d.rounded_rectangle((300, 215, 415, 275), radius=12, fill=dark)           # tuner window
    d.line([(330, 228), (330, 262)], fill=(251, 146, 60), width=8)
    d.ellipse((310, 300, 360, 350), fill=dark)                                # knobs
    d.ellipse((370, 300, 410, 340), fill=dark)
    return img


if __name__ == "__main__":
    big = draw()
    for name, size in [("icon.png", 80), ("largeIcon.png", 130)]:
        big.resize((size, size), Image.LANCZOS).save(HERE / name)
        print("wrote", name, size)
