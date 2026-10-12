#!/usr/bin/env python3
"""Draw the Enviar icon (phone sending to a TV). Writes the TV icons (80/130) and the phone page icons (192/512)."""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
SEND = HERE.parent.parent / "send"
S = 520  # draw large, downscale for smooth edges


def draw() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = Image.new("RGBA", (S, S))
    top, bottom = (99, 102, 241), (49, 46, 129)
    for y in range(S):
        t = y / (S - 1)
        bg.paste(tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,), (0, y, S, y + 1))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=110, fill=255)
    img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)
    white, dark = (241, 245, 249), (30, 27, 75)
    # TV (right/top)
    d.rounded_rectangle((200, 90, 470, 270), radius=22, fill=white)
    d.rounded_rectangle((220, 110, 450, 250), radius=10, fill=(129, 140, 248))
    d.rounded_rectangle((310, 270, 360, 300), radius=6, fill=white)
    # phone (left/bottom)
    d.rounded_rectangle((60, 230, 190, 450), radius=24, fill=white)
    d.rounded_rectangle((75, 255, 175, 415), radius=10, fill=dark)
    d.ellipse((115, 424, 135, 444), fill=dark)
    # arrow phone -> TV
    d.line([(200, 330), (300, 330), (300, 300)], fill=(253, 224, 71), width=24, joint="curve")
    d.polygon([(268, 312), (332, 312), (300, 262)], fill=(253, 224, 71))
    return img


if __name__ == "__main__":
    big = draw()
    for path, size in [(HERE / "icon.png", 80), (HERE / "largeIcon.png", 130), (SEND / "icon-192.png", 192), (SEND / "icon-512.png", 512)]:
        big.resize((size, size), Image.LANCZOS).save(path)
        print("wrote", path.relative_to(HERE.parent.parent), size)
