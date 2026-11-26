// Gera os ícones da app (192 e 512 px) a partir de um desenho simples:
// quadrado âmbar arredondado com um raio (símbolo de eletricidade)
import sharp from "sharp";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <rect x="0" y="0" width="24" height="24" rx="5" fill="#F59E0B"/>
  <polygon points="13,2.5 3.5,13.5 11,13.5 10,21.5 20.5,10.5 13,10.5" fill="#FFFFFF"/>
</svg>`;

async function main() {
  const base = sharp(Buffer.from(svg), { density: 300 });
  await base.clone().resize(192, 192).png().toFile("public/icon-192.png");
  await base.clone().resize(512, 512).png().toFile("public/icon-512.png");
  console.log("ícones criados: public/icon-192.png e public/icon-512.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
