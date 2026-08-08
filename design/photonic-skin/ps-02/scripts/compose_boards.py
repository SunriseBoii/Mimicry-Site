"""Compose deterministic PS-02 comparison boards from Blender panel renders."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


SCRIPT_PATH = Path(__file__).resolve()
PS02_DIR = SCRIPT_PATH.parent.parent
RENDER_DIR = PS02_DIR / "renders"
PANEL_DIR = RENDER_DIR / "_panels"
FONT_REGULAR = Path("C:/Windows/Fonts/arial.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")

BG = "#F4F5F2"
INK = "#17181A"
MUTED = "#666A70"
RULE = "#9A9E9B"
DARK = "#111214"
LIGHT_INK = "#F4F4EF"

CANDIDATES = {
    "A": "A / DIRECTED FOLD",
    "B": "B / LIFTED CREST",
    "C": "C / TENSIONED CORE",
}


def font(size: int, bold: bool = False):
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size=size)


def label(draw: ImageDraw.ImageDraw, xy, text, size=26, fill=INK, bold=False, anchor=None):
    draw.text(xy, text, font=font(size, bold), fill=fill, anchor=anchor)


def board_header(canvas: Image.Image, title: str, subtitle: str, dark: bool = False):
    draw = ImageDraw.Draw(canvas)
    ink = LIGHT_INK if dark else INK
    muted = "#B8BBC0" if dark else MUTED
    label(draw, (70, 55), "PS-02 / MIMIC CORE", 24, muted, True)
    label(draw, (70, 94), title, 54, ink, True)
    label(draw, (70, 164), subtitle, 22, muted)
    draw.line((70, 215, canvas.width - 70, 215), fill="#555960" if dark else RULE, width=2)


def fit_panel(path: Path, size: tuple[int, int], background: str):
    image = Image.open(path).convert("RGB")
    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def grid_board(
    filename: str,
    title: str,
    subtitle: str,
    cells,
    columns: int,
    panel_size: tuple[int, int],
    dark: bool = False,
):
    margin = 70
    gap = 24
    label_height = 58
    rows = (len(cells) + columns - 1) // columns
    width = margin * 2 + columns * panel_size[0] + (columns - 1) * gap
    height = 250 + rows * (panel_size[1] + label_height) + (rows - 1) * gap + 55
    background = DARK if dark else BG
    canvas = Image.new("RGB", (width, height), background)
    board_header(canvas, title, subtitle, dark)
    draw = ImageDraw.Draw(canvas)
    ink = LIGHT_INK if dark else INK
    muted = "#B8BBC0" if dark else MUTED
    for index, (path, main_label, detail) in enumerate(cells):
        row, column = divmod(index, columns)
        x = margin + column * (panel_size[0] + gap)
        y = 250 + row * (panel_size[1] + label_height + gap)
        panel = fit_panel(path, panel_size, background)
        canvas.paste(panel, (x, y))
        label(draw, (x, y + panel_size[1] + 12), main_label, 22, ink, True)
        label(draw, (x + panel_size[0], y + panel_size[1] + 13), detail, 17, muted, False, "ra")
    canvas.save(RENDER_DIR / filename, optimize=True)


comparison_cells = []
for candidate, candidate_label in CANDIDATES.items():
    for view, view_label in (
        ("three-quarter", "3/4"),
        ("profile", "PROFILE"),
        ("front", "FRONT"),
        ("top", "TOP"),
    ):
        comparison_cells.append(
            (PANEL_DIR / f"comparison_{candidate}_{view}.png", candidate_label, view_label)
        )

grid_board(
    "ps02_comparison_board.png",
    "A/B/C FORM COMPARISON",
    "IDENTICAL BOUNDING BOX / 55 MM CAMERA / LIGHT / SCALE / SUBDIVISION 0",
    comparison_cells,
    columns=4,
    panel_size=(720, 540),
)


active_cells = []
for theme in ("light", "dark"):
    for candidate, candidate_label in CANDIDATES.items():
        active_cells.append(
            (PANEL_DIR / f"active_{theme}_{candidate}.png", candidate_label, f"{theme.upper()} / 34%")
        )

grid_board(
    "ps02_active_zone_board.png",
    "PHOTONIC ACTIVE ZONE",
    "SAME PARAMETRIC MASK / CONTENT #4C7AFF / DESIGN #9E64EE / DIGITAL #009FAC",
    active_cells,
    columns=3,
    panel_size=(840, 598),
)


morph_cells = []
for candidate, candidate_label in CANDIDATES.items():
    for progress in (0, 25, 50, 75, 100):
        morph_cells.append(
            (PANEL_DIR / f"morph_{candidate}_{progress:03d}.png", candidate_label, f"COMPLEX {progress}%")
        )

grid_board(
    "ps02_morph_board.png",
    "MASTER → COMPLEX_TEST",
    "LINEAR SHAPE-KEY INTERPOLATION / 0 · 25 · 50 · 75 · 100% / NEUTRAL CERAMIC",
    morph_cells,
    columns=5,
    panel_size=(590, 442),
)


wire_cells = [
    (PANEL_DIR / f"wire_{candidate}.png", candidate_label, "8,322 V / 16,640 TRI")
    for candidate, candidate_label in CANDIDATES.items()
]
grid_board(
    "ps02_wireframe_board.png",
    "SHARED TOPOLOGY",
    "IDENTICAL VERTEX ORDER / FACE INDEX / UV LOGIC / CLOSED MANIFOLD SURFACE",
    wire_cells,
    columns=3,
    panel_size=(840, 612),
)


def silhouette_board():
    width, height = 2780, 1540
    canvas = Image.new("RGB", (width, height), "#FFFFFF")
    board_header(
        canvas,
        "BLACK SILHOUETTES",
        "LARGE READ / APPROX. 180 PX MOBILE READ / NO MATERIAL OR COLOR EFFECTS",
    )
    draw = ImageDraw.Draw(canvas)
    margin, gap = 70, 25
    panel_width = (width - 2 * margin - 2 * gap) // 3
    for column, (candidate, candidate_label) in enumerate(CANDIDATES.items()):
        x = margin + column * (panel_width + gap)
        source = Image.open(PANEL_DIR / f"silhouette_{candidate}.png").convert("RGB")
        large = ImageOps.fit(source, (panel_width, 760), method=Image.Resampling.LANCZOS)
        canvas.paste(large, (x, 255))
        small = ImageOps.fit(source, (180, 132), method=Image.Resampling.LANCZOS)
        small_x = x + (panel_width - 180) // 2
        canvas.paste(small, (small_x, 1115))
        draw.rectangle((small_x - 1, 1114, small_x + 181, 1248), outline="#C3C5C3", width=1)
        label(draw, (x, 1033), candidate_label, 25, INK, True)
        label(draw, (x + panel_width // 2, 1275), "~180 PX", 18, MUTED, True, "ma")
    canvas.save(RENDER_DIR / "ps02_silhouette_board.png", optimize=True)


silhouette_board()
print("PS02_BOARDS_DONE", RENDER_DIR)

