#!/usr/bin/env python3
"""Extract and normalize a Factory Office sprite from a pale generated backdrop."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path
from statistics import median

from PIL import Image


def background_reference(rgb: Image.Image) -> tuple[int, int, int]:
    width, height = rgb.size
    border = []
    for x in range(width):
        border.append(rgb.getpixel((x, 0)))
        border.append(rgb.getpixel((x, height - 1)))
    for y in range(height):
        border.append(rgb.getpixel((0, y)))
        border.append(rgb.getpixel((width - 1, y)))
    return tuple(round(median(channel)) for channel in zip(*border))


def color_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> float:
    return sum((a - b) ** 2 for a, b in zip(left, right)) ** 0.5


def is_connected_background(
    rgb: tuple[int, int, int], reference: tuple[int, int, int]
) -> bool:
    return min(rgb) >= 150 and color_distance(rgb, reference) <= 95


def extract_alpha(source: Image.Image) -> Image.Image:
    rgb = source.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    reference = background_reference(rgb)
    background = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if not background[index] and is_connected_background(pixels[x, y], reference):
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

    # Feather only backdrop-like pixels touching extracted background. Enclosed
    # whites inside outlined props and clothing remain untouched.
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            if background[y * width + x]:
                continue
            r, g, b = pixels[x, y]
            distance = color_distance((r, g, b), reference)
            if min(r, g, b) < 140 or distance > 112:
                continue
            adjacent = (
                background[y * width + x - 1]
                or background[y * width + x + 1]
                or background[(y - 1) * width + x]
                or background[(y + 1) * width + x]
            )
            if adjacent:
                alpha = max(0, min(255, round((distance - 82) * 255 / 30)))
                output[x, y] = (r, g, b, alpha)

    return rgba


def keep_primary_component(sprite: Image.Image, threshold: int = 32) -> Image.Image:
    """Remove detached status tokens, sender hands and neighboring-cell debris."""
    rgba = sprite.copy()
    alpha = rgba.getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] < threshold:
                continue
            visited[index] = 1
            queue = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or pixels[next_x, next_y] < threshold:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))
            components.append(component)

    if not components:
        raise ValueError("No connected foreground component found")
    primary = max(components, key=len)
    primary_pixels = set(primary)
    allowed_pixels = set(primary_pixels)
    for _ in range(2):
        expanded = set(allowed_pixels)
        for x, y in allowed_pixels:
            for next_x, next_y in (
                (x - 1, y),
                (x + 1, y),
                (x, y - 1),
                (x, y + 1),
            ):
                if 0 <= next_x < width and 0 <= next_y < height:
                    expanded.add((next_x, next_y))
        allowed_pixels = expanded
    output = rgba.load()
    for y in range(height):
        for x in range(width):
            if pixels[x, y] and (x, y) not in allowed_pixels:
                r, g, b, _ = output[x, y]
                output[x, y] = (r, g, b, 0)
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
    return keep_primary_component(canvas, threshold=128)


def save_sprite(sprite: Image.Image, output_png: Path, output_webp: Path) -> None:
    output_png.parent.mkdir(parents=True, exist_ok=True)
    output_webp.parent.mkdir(parents=True, exist_ok=True)
    sprite.save(output_png, format="PNG", optimize=True)
    runtime = sprite.resize((512, 512), Image.Resampling.LANCZOS)
    runtime.save(output_webp, format="WEBP", lossless=True, method=6)


def prepare_sheet(
    source: Image.Image,
    actions: list[str],
    columns: int,
    rows: int,
    output_dir: Path,
    canvas_size: int,
    character_height: int,
    baseline: int,
    skip_existing: bool,
) -> None:
    if len(actions) != columns * rows:
        raise ValueError("Action count must equal sheet columns multiplied by rows")

    width, height = source.size
    for index, action in enumerate(actions):
        column = index % columns
        row = index // columns
        bounds = (
            round(column * width / columns),
            round(row * height / rows),
            round((column + 1) * width / columns),
            round((row + 1) * height / rows),
        )
        output_png = output_dir / f"{action}.png"
        output_webp = output_dir / f"{action}.webp"
        if skip_existing and output_png.exists() and output_webp.exists():
            continue
        cell = source.crop(bounds)
        sprite = normalize(
            keep_primary_component(extract_alpha(cell)),
            canvas_size,
            character_height,
            baseline,
        )
        save_sprite(sprite, output_png, output_webp)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output_png", type=Path, nargs="?")
    parser.add_argument("output_webp", type=Path, nargs="?")
    parser.add_argument("--canvas", type=int, default=1024)
    parser.add_argument("--character-height", type=int, default=860)
    parser.add_argument("--baseline", type=int, default=944)
    parser.add_argument("--sheet-actions")
    parser.add_argument("--sheet-cols", type=int)
    parser.add_argument("--sheet-rows", type=int)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()

    with Image.open(args.input) as source:
        if args.sheet_actions:
            if not args.sheet_cols or not args.sheet_rows or not args.output_dir:
                parser.error("Sheet mode requires --sheet-cols, --sheet-rows and --output-dir")
            prepare_sheet(
                source.convert("RGB"),
                [action.strip() for action in args.sheet_actions.split(",")],
                args.sheet_cols,
                args.sheet_rows,
                args.output_dir,
                args.canvas,
                args.character_height,
                args.baseline,
                args.skip_existing,
            )
        else:
            if not args.output_png or not args.output_webp:
                parser.error("Single-sprite mode requires output_png and output_webp")
            sprite = normalize(
                extract_alpha(source),
                args.canvas,
                args.character_height,
                args.baseline,
            )
            save_sprite(sprite, args.output_png, args.output_webp)


if __name__ == "__main__":
    main()
