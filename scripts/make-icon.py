from PIL import Image, ImageDraw, ImageFont

size = 180
image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=40, fill=(77, 107, 254, 255))

font = None
for path in (
    r"C:\Windows\Fonts\seguisym.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
):
    try:
        font = ImageFont.truetype(path, 118)
        break
    except OSError:
        continue

glyph = "\u21bb"
if font is None:
    raise SystemExit("no usable font")

box = draw.textbbox((0, 0), glyph, font=font)
width = box[2] - box[0]
height = box[3] - box[1]
x = (size - width) / 2 - box[0]
y = (size - height) / 2 - box[1]
draw.text((x, y), glyph, font=font, fill=(255, 255, 255, 255))

image.save(r"E:\document\DSH\dsh-restart\assets\icon-180.png")
print("saved")
