from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

source = Path('acceptance-results/visual/flow')
files = sorted(source.glob('*.png'))
thumb_width = 320
thumb_height = 205
label_height = 34
columns = 2
rows = (len(files) + columns - 1) // columns
sheet = Image.new('RGB', (columns * thumb_width, rows * (thumb_height + label_height)), '#e9e4da')
draw = ImageDraw.Draw(sheet)
for index, file in enumerate(files):
    image = Image.open(file).convert('RGB')
    image.thumbnail((thumb_width - 12, thumb_height - 12))
    x = (index % columns) * thumb_width + (thumb_width - image.width) // 2
    y = (index // columns) * (thumb_height + label_height) + (thumb_height - image.height) // 2
    sheet.paste(image, (x, y))
    draw.text(((index % columns) * thumb_width + 8, (index // columns) * (thumb_height + label_height) + thumb_height + 7), file.stem, fill='#111111')
sheet.save(source / 'contact-sheet.png')
