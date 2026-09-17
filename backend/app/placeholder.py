from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
from typing import Tuple, Union


def get_resolution_for_aspect_ratio(aspect_ratio: str) -> Tuple[int, int]:
    ar = str(aspect_ratio).strip().lower()
    if ar in ["9:16", "portrait"]:
        return (1080, 1920)
    elif ar in ["1:1", "square"]:
        return (1080, 1080)
    elif ar in ["4:5"]:
        return (1080, 1350)
    # Default 16:9 Landscape
    return (1920, 1080)


def create_placeholder(
    text: str,
    output_path: Path,
    size: Union[Tuple[int, int], str] = (1920, 1080),
    scene_id: int = 1
) -> str:
    """Creates a sleek, modern visual card with fallback text and aspect ratio awareness"""
    if isinstance(size, str):
        width, height = get_resolution_for_aspect_ratio(size)
    else:
        width, height = size

    # Modern dark cinematic slate background
    img = Image.new('RGB', (width, height), color=(15, 23, 42))  # slate-900
    draw = ImageDraw.Draw(img)

    # Cross-platform font resolution
    font_large = None
    font_small = None
    font_badge = None
    
    font_candidates = [
        ("arialbd.ttf", "arial.ttf"),
        ("C:\\Windows\\Fonts\\arialbd.ttf", "C:\\Windows\\Fonts\\arial.ttf"),
        ("C:\\Windows\\Fonts\\segoeui.ttf", "C:\\Windows\\Fonts\\segoeui.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Helvetica.ttc")
    ]

    base_scale = min(width, height) / 1080.0
    large_size = max(28, int(44 * base_scale))
    small_size = max(18, int(26 * base_scale))
    badge_size = max(16, int(22 * base_scale))

    for bold_f, reg_f in font_candidates:
        try:
            font_large = ImageFont.truetype(bold_f, large_size)
            font_small = ImageFont.truetype(reg_f, small_size)
            font_badge = ImageFont.truetype(bold_f, badge_size)
            break
        except Exception:
            continue

    if font_large is None:
        try:
            font_large = ImageFont.load_default(size=large_size)
            font_small = ImageFont.load_default(size=small_size)
            font_badge = ImageFont.load_default(size=badge_size)
        except Exception:
            font_large = ImageFont.load_default()
            font_small = font_large
            font_badge = font_large

    # Decorative inner border
    margin = int(24 * base_scale)
    draw.rectangle(
        [margin, margin, width - margin, height - margin],
        outline=(51, 65, 85),  # slate-700
        width=int(3 * base_scale)
    )

    # Scene Badge at Top Left
    badge_text = f"SCENE {scene_id} · VISUAL PLACEHOLDER"
    draw.text((margin + int(20 * base_scale), margin + int(20 * base_scale)), badge_text, fill=(148, 163, 184), font=font_badge)

    # Center Heading
    heading_text = "VISUAL PROMPT"
    bbox = draw.textbbox((0, 0), heading_text, font=font_large)
    head_w = bbox[2] - bbox[0]
    head_y = int(height * 0.38)
    draw.text(((width - head_w) // 2, head_y), heading_text, fill=(96, 165, 250), font=font_large)  # blue-400

    # Wrap prompt / fallback text
    max_line_width = width - (margin * 4)
    words = (text or "Stock visual footage").split()
    lines = []
    current_line = []
    for word in words:
        test_line = ' '.join(current_line + [word])
        bbox = draw.textbbox((0, 0), test_line, font=font_small)
        if bbox[2] - bbox[0] < max_line_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(' '.join(current_line))
            current_line = [word]
    if current_line:
        lines.append(' '.join(current_line))

    # Draw wrapped lines
    line_y = head_y + int(60 * base_scale)
    line_spacing = int(36 * base_scale)
    for line in lines[:8]:  # limit lines
        bbox = draw.textbbox((0, 0), line, font=font_small)
        lw = bbox[2] - bbox[0]
        draw.text(((width - lw) // 2, line_y), line, fill=(241, 245, 249), font=font_small)
        line_y += line_spacing

    img.save(output_path, quality=95)
    return str(output_path)