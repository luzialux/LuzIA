# Gera o logótipo e os ícones da LuzIA a partir da imagem original do utilizador.
# Fundo branco (como a própria imagem), recorte e margens calculados — sem IA.
from PIL import Image, ImageOps

SRC = "/home/z/my-project/upload/luzia.jpg"
PUB = "/home/z/my-project/public/"

src = Image.open(SRC).convert("RGB")


def tile(size: int, fill_frac: float, crop_frac: float = 0.0) -> Image.Image:
    img = src
    if crop_frac > 0:
        w, h = img.size
        c = int(w * crop_frac)
        img = img.crop((c, c, w - c, h - c))
    inner = int(size * fill_frac)
    im2 = img.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    canvas.paste(im2, ((size - inner) // 2, (size - inner) // 2))
    return canvas


# logótipo do cabeçalho: recorte leve para a lâmpada ficar maior no quadrado
tile(384, 1.0, 0.085).save(PUB + "logo-luzia.png", optimize=True)
# ícones da PWA (any)
tile(512, 0.90).save(PUB + "icon-512.png", optimize=True)
tile(192, 0.90).save(PUB + "icon-192.png", optimize=True)
# ícone iOS (não pode ser transparente)
tile(180, 0.92).save(PUB + "apple-touch-icon.png", optimize=True)
# ícone adaptável Android (zona segura ~80%)
tile(512, 0.72).save(PUB + "icon-maskable-512.png", optimize=True)

for n in ["logo-luzia.png", "icon-512.png", "icon-192.png", "apple-touch-icon.png", "icon-maskable-512.png"]:
    im = Image.open(PUB + n)
    print(n, im.size, im.mode)
