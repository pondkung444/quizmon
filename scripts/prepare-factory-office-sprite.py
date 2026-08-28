#!/usr/bin/env python3
"""Extract and normalize a Factory Office sprite from a pale generated backdrop."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def is_connected_background(rgb: tuple[int, int, int]) -> bool:
    minimum = min(rgb)
    maximum = max(rgb)
    return minimum >= 225 and maximum - minimum <= 12


def extract_alpha(source: Image.Image) -> Image.Image:
    rgb = source.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    background = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if not background[index] and is_connected_background(pixels[x, y]):
            background[index] = 1
            queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    rgba = rgb.convert("RGBA")
    output = rgba.load()
    for y in range(height):
        for x in range(width):
            if background[y * width + x]:
                output[x, y] = (255, 255, 255, 0)

    # Feather only pale neutral pixels touching extracted background. This removes
    # the generated matte without changing enclosed whites inside the character.
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            if background[y * width + x]:
                continue
            r, g, b = pixels[x, y]
            if min(r, g, b) < 190 or max(r, g, b) - min(r, g, b) > 18:
                continue
            adjacent = (
                background[y * width + x - 1]
                or background[y * width + x + 1]
                or background[(y - 1) * width + x]
                or background[(y + 1) * width + x]
            )
            if adjacent:
                alpha = max(0, min(255, round((225 - min(r, g, b)) * 255 / 35)))
                output[x, y] = (r, g, b, alpha)

    return rgba


def normalize(
    sprite: Image.Image,
    canvas_size: int,
    character_height: int,
    baseline: int,
) -> Image.Image:
    alpha = sprite.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("No foreground pixels remained after background extraction")

    cropped = sprite.crop(bounds)
    scale = min(character_height / cropped.height, (canvas_size * 0.82) / cropped.width)
    resized = cropped.resize(
        (round(cropped.width * scale), round(cropped.height * scale)),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 0))
    x = (canvas_size - resized.width) // 2
    y = baseline - resized.height
    if y < 0 or baseline > canvas_size:
        raise ValueError("Normalized sprite does not fit the requested canvas")
    canvas.alpha_composite(resized, (x, y))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output_png", type=Path)
    parser.add_argument("output_webp", type=Path)
    parser.add_argument("--canvas", type=int, default=1024)
    parser.add_argument("--character-height", type=int, default=860)
    parser.add_argument("--baseline", type=int, default=944)
    args = parser.parse_args()

    with Image.open(args.input) as source:
        sprite = normalize(
            extract_alpha(source),
            args.canvas,
            args.character_height,
            args.baseline,
        )

    args.output_png.parent.mkdir(parents=True, exist_ok=True)
    args.output_webp.parent.mkdir(parents=True, exist_ok=True)
    sprite.save(args.output_png, format="PNG", optimize=True)
    runtime = sprite.resize((512, 512), Image.Resampling.LANCZOS)
    runtime.save(args.output_webp, format="WEBP", lossless=True, method=6)


if __name__ == "__main__":
    main()
