"""PNG header checks.

Pillow reports mode "RGBA" for both 8-bit and 16-bit RGBA PNGs, so the bit
depth is read from the IHDR chunk directly.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
COLOUR_CHUNKS = {b"iCCP", b"sRGB", b"gAMA", b"cHRM"}
COLOUR_TYPES = {0: "greyscale", 2: "RGB", 3: "palette", 4: "greyscale+alpha", 6: "RGBA"}


@dataclass
class PngInfo:
    width: int
    height: int
    bit_depth: int
    colour_type: int
    pil_mode: str
    colour_chunks: list[str] = field(default_factory=list)

    @property
    def colour_name(self) -> str:
        return COLOUR_TYPES.get(self.colour_type, f"type {self.colour_type}")


def read_png(path: Path) -> PngInfo:
    """Read size, bit depth and colour chunks. Raises ValueError if not a PNG."""
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("not a PNG file")
    pos = len(PNG_SIGNATURE)
    ihdr = None
    colour_chunks: list[str] = []
    while pos + 8 <= len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        ctype = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        if ctype == b"IHDR":
            if len(body) != 13:
                raise ValueError("bad IHDR chunk")
            ihdr = struct.unpack(">IIBBBBB", body)
        elif ctype in COLOUR_CHUNKS:
            colour_chunks.append(ctype.decode("ascii"))
        elif ctype in (b"IDAT", b"IEND"):
            break  # colour chunks must come before IDAT
        pos += 12 + length
    if ihdr is None:
        raise ValueError("PNG has no IHDR chunk")
    width, height, depth, colour_type = ihdr[0], ihdr[1], ihdr[2], ihdr[3]
    with Image.open(path) as im:
        if im.format != "PNG":
            raise ValueError(f"Pillow reads it as {im.format}, not PNG")
        mode = im.mode
        im.verify()
    return PngInfo(width, height, depth, colour_type, mode, colour_chunks)
