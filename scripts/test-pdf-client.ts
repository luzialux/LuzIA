// Testa a leitura de PDF como acontece no navegador: pdfjs-dist + parser.
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist";
import { parseInvoiceText } from "../src/lib/invoice-parser";

async function main() {
  const ficheiro = process.argv[2] ?? "upload/novembro-26.pdf";
  const dados = new Uint8Array(readFileSync(ficheiro));
  const doc = await pdfjs.getDocument({ data: dados }).promise;
  const paginas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const conteudo = await (await doc.getPage(p)).getTextContent();
    paginas.push(
      conteudo.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .join("\n")
    );
  }
  const texto = paginas.join("\n");
  const r = parseInvoiceText(texto);
  console.log("operador:", r.operatorName);
  console.log("mes/ano:", r.month, r.year);
  console.log("kwh:", r.kwh);
  console.log("valor:", r.costEur);
  console.log("tarifa:", r.tariff);
  console.log("leituras:", JSON.stringify(r.readings));
  console.log("bate certo:", r.readingsCheckOk);
  const ok =
    r.kwh === 541 && r.costEur === 132.1 && r.readings.length === 3 && r.readingsCheckOk;
  console.log(ok ? "TUDO CERTO" : "FALHOU");
  process.exit(ok ? 0 : 1);
}

main();
