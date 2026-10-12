#!/usr/bin/env python3
"""Draw the Canais icon (TV with a play button and antenna) and write icon.png (80) and largeIcon.png (130)."""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
S = 520  # draw large, downscale for smooth edges


def draw() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = Image.new("RGBA", (S, S))
    top, bottom = (126, 34, 206), (46, 16, 101)
    for y in range(S):
        t = y / (S - 1)
        bg.paste(tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,), (0, y, S, y + 1))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=110, fill=255)
    img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)
    white = (245, 243, 255)
    d.line([(260, 150), (190, 70)], fill=white, width=16)                    # antenna
    d.line([(260, 150), (330, 70)], fill=white, width=16)
    d.rounded_rectangle((80, 150, 440, 410), radius=36, fill=white)          # TV
    d.rounded_rectangle((105, 175, 415, 385), radius=20, fill=(76, 29, 149))
    d.polygon([(225, 222), (225, 338), (322, 280)], fill=(250, 204, 21))     # play
    d.ellipse((380, 425, 410, 455), fill=(239, 68, 68))                     # "live" dot
    return img


if __name__ == "__main__":
    big = draw()
    for name, size in [("icon.png", 80), ("largeIcon.png", 130)]:
        big.resize((size, size), Image.LANCZOS).save(HERE / name)
        print("wrote", name, size)
