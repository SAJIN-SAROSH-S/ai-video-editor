from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

def create_placeholder(text: str, output_path: Path, size=(1920, 1080)):
    """Creates white image with visual prompt text"""
    img = Image.new('RGB', size, color='white')
    draw = ImageDraw.Draw(img)
    
    # Try to use a nice font, fallback to default
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
    except:
        font_large = ImageFont.load_default()
        font_small = font_large
    
    # Center text
    bbox = draw.textbbox((0, 0), "NEEDED:", font=font_large)
    text_w = bbox[2] - bbox[0]
    draw.text(((size[0]-text_w)//2, size[1]//2 - 60), "NEEDED:", fill='black', font=font_large)
    
    # Wrap text if too long
    words = text.split()
    lines = []
    current_line = []
    for word in words:
        test_line = ' '.join(current_line + [word])
        bbox = draw.textbbox((0, 0), test_line, font=font_small)
        if bbox[2] - bbox[0] < size[0] - 100:
            current_line.append(word)
        else:
            lines.append(' '.join(current_line))
            current_line = [word]
    if current_line:
        lines.append(' '.join(current_line))
    
    y_offset = size[1] // 2
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font_small)
        text_w = bbox[2] - bbox[0]
        draw.text(((size[0]-text_w)//2, y_offset), line, fill='gray', font=font_small)
        y_offset += 35
    
    # Add border
    draw.rectangle([10, 10, size[0]-10, size[1]-10], outline='red', width=5)
    
    img.save(output_path)
    return str(output_path)