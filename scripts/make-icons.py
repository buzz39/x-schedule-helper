#!/usr/bin/env python3
"""Draw the Draft Queue toolbar icons. Uses only the Python standard library."""

import struct
import zlib
from pathlib import Path

TEAL = (15, 95, 87, 255)
CREAM = (246, 241, 230, 255)
CLEAR = (0, 0, 0, 0)


def in_round_rect(x, y, x0, y0, x1, y1, radius):
    if x0 + radius <= x <= x1 - radius and y0 <= y <= y1:
        return True
    if y0 + radius <= y <= y1 - radius and x0 <= x <= x1:
        return True
    for cx, cy in (
        (x0 + radius, y0 + radius),
        (x1 - radius, y0 + radius),
        (x0 + radius, y1 - radius),
        (x1 - radius, y1 - radius),
    ):
        if (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2:
            return True
    return False


def sample(size, x, y):
    pad = size * 0.06
    radius = size * 0.22
    if not in_round_rect(x, y, pad, pad, size - pad, size - pad, radius):
        return CLEAR
    left = size * 0.24
    right = size * 0.76
    for top, width in ((0.30, 1), (0.46, 0.72), (0.62, 0.48)):
        y0 = size * top
        y1 = y0 + size * 0.08
        x1 = left + (right - left) * width
        if in_round_rect(x, y, left, y0, x1, y1, (y1 - y0) / 2):
            return CREAM
    return TEAL


def render_smooth(size):
    samples = 4
    pixels = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(samples):
                for sx in range(samples):
                    color = sample(size, x + (sx + 0.5) / samples, y + (sy + 0.5) / samples)
                    for index, channel in enumerate(color):
                        acc[index] += channel
            count = samples * samples
            row.append(tuple(channel // count for channel in acc))
        pixels.append(row)
    return pixels


def render_crisp(size):
    """Pixel-snapped icon so the 16px toolbar glyph stays readable."""
    grid = 16
    canvas = [[CLEAR for _ in range(grid)] for _ in range(grid)]
    for y in range(grid):
        for x in range(grid):
            if in_round_rect(x + 0.5, y + 0.5, 0.4, 0.4, grid - 0.4, grid - 0.4, 3.2):
                canvas[y][x] = TEAL
    for x0, y0, x1, y1 in ((3, 4, 13, 6), (3, 7, 11, 9), (3, 10, 8, 12)):
        for y in range(y0, y1):
            for x in range(x0, x1):
                canvas[y][x] = CREAM
    pixels = []
    for y in range(size):
        row = []
        for x in range(size):
            row.append(canvas[min(grid - 1, y * grid // size)][min(grid - 1, x * grid // size)])
        pixels.append(row)
    return pixels


def render(size):
    return render_crisp(size) if size <= 32 else render_smooth(size)


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, pixels):
    size = len(pixels)
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for red, green, blue, alpha in row:
            raw.extend((red, green, blue, alpha))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    out = Path(__file__).resolve().parents[1] / "extension" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(out / f"icon{size}.png", render(size))


if __name__ == "__main__":
    main()
