// Base de dados da LuzIA.
//
// A cópia local vive no navegador (IndexedDB): é ela que a app mostra, é
// rápida e funciona sem internet. Por cima disto corre a sincronização que
// mantém UMA verdade para todos os aparelhos: um documento no Vercel Blob
// (via /api/data) com tudo — casas, consumos, operadores e faturas (os PDFs
// via /api/invoice). Cada registo leva um updatedAt e, quando dois
// aparelhos divergem, ganha quem editou por último.

import Dexie, { type Table } from "dexie";
import type {
  House,
  Invoice,
  InvoiceReading,
  Operator,
  Reading,
} from "./appTypes";
import { parseInvoiceText } from "./invoice-parser";
import seedJson from "./seed-data.json";

export type LocalInvoice = Invoice & {
  pdfData?: Blob | null;
  pdfUrl?: string | null;
  hasPdf?: boolean;
};

type DbHouse = House & { createdAt: string };
type SeedInvoice = Invoice;

type SeedShape = {
  houses: DbHouse[];
  readings: Reading[];
  operators: Operator[];
  invoices: SeedInvoice[];
};

class LuzDb extends Dexie {
  houses!: Table<DbHouse, string>;
  readings!: Table<Reading, string>;
  operators!: Table<Operator, string>;
  invoices!: Table<LocalInvoice, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super("luz-em-casa");
    this.version(1).stores({
      houses: "id, createdAt",
      readings: "id, houseId, year, month, [houseId+year+month]",
      operators: "id, name, sortOrder",
      invoices: "id, houseId, year, month, [houseId+year+month]",
      meta: "key",
    });
  }
}

let _db: LuzDb | null = null;

function db(): LuzDb {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    throw new Error("A base de dados só funciona dentro do navegador.");
  }
  if (!_db) _db = new LuzDb();
  return _db;
}

// ---- primeira vez: traz as casas, os consumos e a fatura já conhecidas ----
const SEED = seedJson as unknown as SeedShape;

export async function ensureSeed(): Promise<void> {
  const d = db();
  const flag = await d.meta.get("seeded-v1");
  if (flag) return;
  const count = await d.houses.count();
  if (count === 0 && SEED.houses.length > 0) {
    await d.transaction(
      "rw",
      d.houses,
      d.readings,
      d.operators,
      d.invoices,
      d.meta,
      async () => {
        await d.houses.bulkPut(SEED.houses);
        await d.readings.bulkPut(SEED.readings);
        await d.operators.bulkPut(SEED.operators);
        await d.invoices.bulkPut(SEED.invoices.map((i) => ({ ...i, pdfData: null })));
        await d.meta.put({ key: "seeded-v1", value: new Date().toISOString() });
      }
    );
  } else {
    await d.meta.put({ key: "seeded-v1", value: new Date().toISOString() });
  }
}

// ---- carga completa para os separadores ----
export type AllData = {
  houses: House[];
  readings: Reading[];
  operators: Operator[];
  invoices: Invoice[];
};

export async function loadAll(): Promise<AllData> {
  const d = db();
  const [houses, readings, operators, invoices] = await Promise.all([
    d.houses.toArray(),
    d.readings.toArray(),
    d.operators.toArray(),
    d.invoices.toArray(),
  ]);
  houses.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  readings.sort(
    (a, b) => a.year - b.year || a.month - b.month || a.houseId.localeCompare(b.houseId)
  );
  const contagem = new Map<string, number>();
  for (const r of readings) contagem.set(r.houseId, (contagem.get(r.houseId) ?? 0) + 1);
  invoices.sort((a, b) => b.year - a.year || b.month - a.month);
  return {
    houses: houses.map((h) => ({ ...h, readingsCount: contagem.get(h.id) ?? 0 })),
    readings,
    operators,
    invoices: invoices.map(({ pdfData: _pdf, hasPdf, ...resto }) => ({
      ...resto,
      hasPdf: hasPdf ?? false,
    })),
  };
}

// ---- casas ----
export async function saveHouse(
  dados: { name: string; color: string },
  id?: string
): Promise<void> {
  const d = db();
  if (id) {
    const existente = await d.houses.get(id);
    if (!existente) throw new Error("Não foi possível atualizar a casa.");
    const agora = new Date().toISOString();
    await d.houses.put({ ...existente, name: dados.name, color: dados.color, updatedAt: agora });
    marcarDirty("houses", id);
    // o nome aparece nas leituras e faturas guardadas — atualiza também
    const idsLeituras = await d.readings.where("houseId").equals(id).primaryKeys();
    const idsFaturas = await d.invoices.where("houseId").equals(id).primaryKeys();
    await d.readings.where("houseId").equals(id).modify({
      houseName: dados.name,
      houseColor: dados.color,
      updatedAt: agora,
    });
    await d.invoices.where("houseId").equals(id).modify({
      houseName: dados.name,
      houseColor: dados.color,
      updatedAt: agora,
    });
    for (const rid of idsLeituras) marcarDirty("readings", String(rid));
    for (const fid of idsFaturas) marcarDirty("invoices", String(fid));
    agendarEnvio();
    return;
  }
  const nova: DbHouse = {
    id: crypto.randomUUID(),
    name: dados.name,
    color: dados.color,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await d.houses.add(nova);
  marcarDirty("houses", nova.id);
  agendarEnvio();
}

export async function deleteHouse(id: string): Promise<void> {
  const d = db();
  const [idsLeituras, faturas] = await Promise.all([
    d.readings.where("houseId").equals(id).primaryKeys(),
    d.invoices.where("houseId").equals(id).toArray(),
  ]);
  await d.transaction("rw", d.houses, d.readings, d.invoices, async () => {
    await d.houses.delete(id);
    await d.readings.where("houseId").equals(id).delete();
    await d.invoices.where("houseId").equals(id).delete();
  });
  apagarRegisto("houses", id);
  for (const rid of idsLeituras) apagarRegisto("readings", String(rid));
  for (const f of faturas) {
    apagarRegisto("invoices", f.id);
    if (f.pdfUrl) void limparPdfNuvemUrl(f.pdfUrl);
  }
  agendarEnvio();
}

// ---- leituras / consumos mensais ----
export async function saveReadingBill(
  houseId: string,
  year: number,
  month: number,
  kwh: number | null,
  costEur: number | null
): Promise<{ mode: "bill" }> {
  const d = db();
  const casa = await d.houses.get(houseId);
  if (!casa) throw new Error("Casa não encontrada.");
  const existente = await d.readings
    .where("[houseId+year+month]")
    .equals([houseId, year, month])
    .first();
  const registo: Reading = {
    id: existente?.id ?? crypto.randomUUID(),
    houseId,
    houseName: casa.name,
    houseColor: casa.color,
    year,
    month,
    kwh: kwh ?? null,
    costEur: costEur ?? null,
    counterValue: existente?.counterValue ?? null,
    updatedAt: new Date().toISOString(),
  };
  await d.readings.put(registo);
  marcarDirty("readings", registo.id);
  agendarEnvio();
  return { mode: "bill" };
}

export async function saveReadingCounter(
  houseId: string,
  date: string, // "AAAA-MM-DD"
  counterValue: number,
  costEur: number | null
): Promise<{ mode: "counter"; kwh: number | null; isBaseline: boolean }> {
  const d = db();
  const casa = await d.houses.get(houseId);
  if (!casa) throw new Error("Casa não encontrada.");

  const data = new Date(date + "T12:00:00");
  const year = data.getFullYear();
  const month = data.getMonth() + 1;

  // última leitura de contador desta casa
  const comContador = (await d.readings.where("houseId").equals(houseId).toArray())
    .filter((r) => r.counterValue != null)
    .sort((a, b) => b.year - a.year || b.month - a.month);
  const previous = comContador[0] ?? null;

  if (previous && counterValue <= (previous.counterValue ?? 0)) {
    throw new Error(
      "O valor do contador tem de ser MAIOR do que a última leitura " +
        `(${(previous.counterValue ?? 0).toLocaleString("pt-PT")} em ` +
        `${String(previous.month).padStart(2, "0")}/${previous.year}). ` +
        "Confirma o número no contador."
    );
  }

  const kwh = previous ? counterValue - (previous.counterValue ?? 0) : null;

  const existente = await d.readings
    .where("[houseId+year+month]")
    .equals([houseId, year, month])
    .first();

  const registo: Reading = {
    id: existente?.id ?? crypto.randomUUID(),
    houseId,
    houseName: casa.name,
    houseColor: casa.color,
    year,
    month,
    kwh: kwh ?? existente?.kwh ?? null,
    costEur: costEur ?? existente?.costEur ?? null,
    counterValue,
    updatedAt: new Date().toISOString(),
  };
  await d.readings.put(registo);
  marcarDirty("readings", registo.id);
  agendarEnvio();
  return { mode: "counter", kwh, isBaseline: !previous };
}

export async function updateReading(
  id: string,
  kwh: number | null,
  costEur: number | null
): Promise<void> {
  const d = db();
  const r = await d.readings.get(id);
  if (!r) throw new Error("Não foi possível guardar.");
  await d.readings.put({ ...r, kwh, costEur, updatedAt: new Date().toISOString() });
  marcarDirty("readings", id);
  agendarEnvio();
}

export async function deleteReading(id: string): Promise<void> {
  await db().readings.delete(id);
  apagarRegisto("readings", id);
  agendarEnvio();
}

// ---- operadores (Ofertas) ----
export async function saveOperator(
  dados: Omit<Operator, "id">,
  id?: string
): Promise<void> {
  const d = db();
  if (id) {
    const existente = await d.operators.get(id);
    if (!existente) throw new Error("Não foi possível guardar.");
    await d.operators.put({ ...existente, ...dados, updatedAt: new Date().toISOString() });
    marcarDirty("operators", id);
    agendarEnvio();
    return;
  }
  const todas = await d.operators.toArray();
  const maxOrdem = todas.reduce((m, o) => Math.max(m, o.sortOrder), 0);
  const novo: Operator = {
    ...dados,
    id: crypto.randomUUID(),
    sortOrder: maxOrdem + 1,
    updatedAt: new Date().toISOString(),
  };
  await d.operators.add(novo);
  marcarDirty("operators", novo.id);
  agendarEnvio();
}

export async function deleteOperator(id: string): Promise<void> {
  await db().operators.delete(id);
  apagarRegisto("operators", id);
  agendarEnvio();
}

// ---- faturas: ler o PDF no próprio navegador e arquivar ----
async function extrairTextoPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/pdf.worker.min.mjs";
  const dados = new Uint8Array(await file.arrayBuffer());
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
  return paginas.join("\n");
}

export type ExtractResult = {
  month: number;
  year: number;
  kwh: number | null;
  costEur: number | null;
  operatorName: string | null;
  tariff: string | null;
  readings: InvoiceReading[];
  readingsCheckOk: boolean;
  notes: string[];
};

export async function saveInvoiceFromPdf(
  houseId: string,
  file: File
): Promise<ExtractResult> {
  const d = db();
  const casa = await d.houses.get(houseId);
  if (!casa) throw new Error("Escolhe uma casa para esta fatura.");
  if (!file || file.size === 0) throw new Error("Falta o ficheiro PDF da fatura.");
  const ePdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!ePdf) {
    throw new Error("O ficheiro tem de ser um PDF (a fatura que a empresa te manda).");
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("O ficheiro é demasiado grande (máx. 15 MB).");
  }

  let texto = "";
  try {
    texto = await extrairTextoPdf(file);
  } catch {
    throw new Error(
      "Não consegui abrir o PDF. Se for uma imagem/scancode, a app não consegue ler — nesse caso registra os valores à mão no separador «Registar»."
    );
  }

  const parsed = parseInvoiceText(texto);
  if (parsed.month == null || parsed.year == null) {
    throw new Error(
      "Li o PDF mas não encontrei o período de faturação nele. Confirma que carregaste a fatura da eletricidade (e não outro documento)."
    );
  }
  if (parsed.kwh == null && parsed.costEur == null) {
    throw new Error(
      "Li o PDF mas não encontrei o consumo nem o valor. Podes registá-los à mão no separador «Registar»."
    );
  }

  // 1) preencher o registo do mês (preservando o que já lá estava)
  const leituraExistente = await d.readings
    .where("[houseId+year+month]")
    .equals([houseId, parsed.year, parsed.month])
    .first();
  const registo: Reading = {
    id: leituraExistente?.id ?? crypto.randomUUID(),
    houseId,
    houseName: casa.name,
    houseColor: casa.color,
    year: parsed.year,
    month: parsed.month,
    kwh: parsed.kwh ?? leituraExistente?.kwh ?? null,
    costEur: parsed.costEur ?? leituraExistente?.costEur ?? null,
    counterValue: leituraExistente?.counterValue ?? null,
    updatedAt: new Date().toISOString(),
  };
  await d.readings.put(registo);
  marcarDirty("readings", registo.id);

  // 2) arquivar a fatura com o PDF dentro (o ficheiro novo substitui o antigo)
  const existente = await d.invoices
    .where("[houseId+year+month]")
    .equals([houseId, parsed.year, parsed.month])
    .first();
  const fatura: LocalInvoice = {
    id: existente?.id ?? crypto.randomUUID(),
    houseId,
    houseName: casa.name,
    houseColor: casa.color,
    fileName: file.name,
    fileSize: file.size,
    year: parsed.year,
    month: parsed.month,
    kwh: parsed.kwh ?? null,
    costEur: parsed.costEur ?? null,
    operatorName: parsed.operatorName,
    tariff: parsed.tariff,
    issuedAt: parsed.issuedAt,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    readings: parsed.readings.length ? parsed.readings : null,
    notes: parsed.notes,
    createdAt: existente?.createdAt ?? new Date().toISOString(),
    pdfData: file,
    pdfUrl: null,
    hasPdf: true,
    updatedAt: new Date().toISOString(),
  };
  await d.invoices.put(fatura);
  marcarDirty("invoices", fatura.id);
  agendarEnvio();

  return {
    month: parsed.month,
    year: parsed.year,
    kwh: parsed.kwh,
    costEur: parsed.costEur,
    operatorName: parsed.operatorName,
    tariff: parsed.tariff,
    readings: parsed.readings,
    readingsCheckOk: parsed.readingsCheckOk,
    notes: parsed.notes,
  };
}

export async function deleteInvoice(id: string): Promise<void> {
  const inv = await db().invoices.get(id);
  await db().invoices.delete(id);
  apagarRegisto("invoices", id);
  agendarEnvio();
  if (inv?.pdfUrl) void limparPdfNuvemUrl(inv.pdfUrl);
}

export async function getInvoicePdfUrl(id: string): Promise<string | null> {
  const inv = await db().invoices.get(id);
  if (inv?.pdfUrl) return inv.pdfUrl;
  if (inv?.pdfData) return URL.createObjectURL(inv.pdfData);
  return null;
}

// ---- cópia de segurança: exportar e trazer de volta ----
function blobParaBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export async function exportData(): Promise<string> {
  const d = db();
  const [houses, readings, operators, invoices] = await Promise.all([
    d.houses.toArray(),
    d.readings.toArray(),
    d.operators.toArray(),
    d.invoices.toArray(),
  ]);
  const nomePorId = new Map(houses.map((h) => [h.id, h.name]));
  const faturas = [] as Record<string, unknown>[];
  for (const f of invoices) {
    const item: Record<string, unknown> = {
      house: f.houseName ?? nomePorId.get(f.houseId) ?? "",
      fileName: f.fileName,
      fileSize: f.fileSize,
      year: f.year,
      month: f.month,
      kwh: f.kwh,
      costEur: f.costEur,
      operatorName: f.operatorName,
      tariff: f.tariff,
      periodStart: f.periodStart,
      periodEnd: f.periodEnd,
      readings: f.readings,
    };
    if (f.pdfData) {
      item.pdfBase64 = await blobParaBase64(f.pdfData);
    } else if (f.pdfUrl) {
      // o PDF está na nuvem — trazê-lo para a cópia de segurança
      try {
        const res = await fetch(f.pdfUrl, { cache: "no-store" });
        if (res.ok) item.pdfBase64 = await blobParaBase64(await res.blob());
      } catch {
        // sem internet: a cópia sai sem este PDF (ele fica na nuvem)
      }
    }
    faturas.push(item);
  }
  return JSON.stringify(
    {
      app: "luz-em-casa",
      version: 1,
      exportadoEm: new Date().toISOString(),
      houses: houses.map((h) => ({ name: h.name, color: h.color })),
      readings: readings.map((r) => ({
        house: r.houseName,
        year: r.year,
        month: r.month,
        kwh: r.kwh,
        costEur: r.costEur,
        counterValue: r.counterValue,
      })),
      operators: operators.map((o) => ({
        name: o.name,
        brandColor: o.brandColor,
        website: o.website,
        isNewPlayer: o.isNewPlayer,
        offerTitle: o.offerTitle,
        offerSummary: o.offerSummary,
        bonusEur: o.bonusEur,
        priceKwh: o.priceKwh,
        conditions: o.conditions,
        sourceUrl: o.sourceUrl,
        sortOrder: o.sortOrder,
      })),
      invoices: faturas,
    },
    null,
    2
  );
}

export type ImportResult = {
  casas: { criadas: number; total: number };
  registos: { criados: number; atualizados: number; total: number };
  operadores: number;
};

export async function importData(bruto: unknown): Promise<ImportResult> {
  const d = db();
  const corpo = bruto as {
    houses?: { name?: unknown; color?: unknown }[];
    readings?: {
      house?: unknown;
      year?: unknown;
      month?: unknown;
      kwh?: unknown;
      costEur?: unknown;
      counterValue?: unknown;
    }[];
    operators?: Record<string, unknown>[];
    invoices?: Record<string, unknown>[];
  };
  if (!Array.isArray(corpo?.houses) || !Array.isArray(corpo?.readings)) {
    throw new Error("O ficheiro não parece um export desta app (JSON inválido).");
  }

  const idsTocadas: Record<TabelaSync, string[]> = {
    houses: [],
    readings: [],
    operators: [],
    invoices: [],
  };

  const resultado = await d.transaction(
    "rw",
    d.houses,
    d.readings,
    d.operators,
    d.invoices,
    async () => {
      // casas
      const idPorNome = new Map<string, string>();
      let casasCriadas = 0;
      for (const h of corpo.houses) {
        const name = String(h.name ?? "").trim();
        const color = String(h.color ?? "#64748B");
        if (!name) continue;
        const existente = await d.houses.where("name").equals(name).first();
        if (existente) {
          if (existente.color !== color) {
            await d.houses.put({ ...existente, color, updatedAt: new Date().toISOString() });
          }
          idPorNome.set(name, existente.id);
          idsTocadas.houses.push(existente.id);
        } else {
          const nova: DbHouse = {
            id: crypto.randomUUID(),
            name,
            color,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await d.houses.add(nova);
          idPorNome.set(name, nova.id);
          idsTocadas.houses.push(nova.id);
          casasCriadas++;
        }
      }

      // consumos (o que já existe não se duplica; campos vazios não apagam nada)
      let criados = 0;
      let atualizados = 0;
      for (const r of corpo.readings) {
        const houseId = idPorNome.get(String(r.house ?? ""));
        const year = Number(r.year);
        const month = Number(r.month);
        if (!houseId || !Number.isInteger(year) || !Number.isInteger(month)) continue;
        const kwh = r.kwh == null ? null : Number(r.kwh);
        const costEur = r.costEur == null ? null : Number(r.costEur);
        const counterValue = r.counterValue == null ? null : Number(r.counterValue);
        const existente = await d.readings
          .where("[houseId+year+month]")
          .equals([houseId, year, month])
          .first();
        const casa = await d.houses.get(houseId);
        if (existente) {
          await d.readings.put({
            ...existente,
            kwh: kwh ?? existente.kwh,
            costEur: costEur ?? existente.costEur,
            counterValue: counterValue ?? existente.counterValue,
            updatedAt: new Date().toISOString(),
          });
          idsTocadas.readings.push(existente.id);
          atualizados++;
        } else {
          const novoRegisto: Reading = {
            id: crypto.randomUUID(),
            houseId,
            houseName: casa?.name ?? String(r.house ?? ""),
            houseColor: casa?.color ?? "#64748B",
            year,
            month,
            kwh,
            costEur,
            counterValue,
            updatedAt: new Date().toISOString(),
          };
          await d.readings.add(novoRegisto);
          idsTocadas.readings.push(novoRegisto.id);
          criados++;
        }
      }

      // operadores
      let operadores = 0;
      for (const o of corpo.operators ?? []) {
        const name = String(o.name ?? "").trim();
        if (!name) continue;
        const existente = await d.operators.where("name").equals(name).first();
        const dados: Omit<Operator, "id"> = {
          name,
          brandColor: String(o.brandColor ?? "#64748B"),
          website: String(o.website ?? ""),
          isNewPlayer: Boolean(o.isNewPlayer),
          offerTitle: o.offerTitle == null ? null : String(o.offerTitle),
          offerSummary: o.offerSummary == null ? null : String(o.offerSummary),
          bonusEur: o.bonusEur == null ? null : Number(o.bonusEur),
          priceKwh: o.priceKwh == null ? null : String(o.priceKwh),
          conditions: o.conditions == null ? null : String(o.conditions),
          sourceUrl: o.sourceUrl == null ? null : String(o.sourceUrl),
          sortOrder: Number(o.sortOrder ?? 0) || 0,
        };
        if (existente) {
          await d.operators.put({ ...existente, ...dados, updatedAt: new Date().toISOString() });
          idsTocadas.operators.push(existente.id);
        } else {
          const novoOper: Operator = {
            ...dados,
            id: crypto.randomUUID(),
            updatedAt: new Date().toISOString(),
          };
          await d.operators.add(novoOper);
          idsTocadas.operators.push(novoOper.id);
        }
        operadores++;
      }

      // faturas arquivadas (com PDF, se vier no ficheiro)
      for (const f of corpo.invoices ?? []) {
        const houseName = String(f.house ?? "");
        const houseId = idPorNome.get(houseName);
        const year = Number(f.year);
        const month = Number(f.month);
        if (!houseId || !Number.isInteger(year) || !Number.isInteger(month)) continue;
        const casa = await d.houses.get(houseId);
        const existente = await d.invoices
          .where("[houseId+year+month]")
          .equals([houseId, year, month])
          .first();
        let pdfData: Blob | null = existente?.pdfData ?? null;
        if (typeof f.pdfBase64 === "string" && f.pdfBase64) {
          const bin = atob(f.pdfBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          pdfData = new Blob([bytes], { type: "application/pdf" });
        }
        const fatura: LocalInvoice = {
          id: existente?.id ?? crypto.randomUUID(),
          houseId,
          houseName: casa?.name ?? houseName,
          houseColor: casa?.color ?? "#64748B",
          fileName: String(f.fileName ?? "fatura.pdf"),
          fileSize: Number(f.fileSize ?? 0) || 0,
          year,
          month,
          kwh: f.kwh == null ? null : Number(f.kwh),
          costEur: f.costEur == null ? null : Number(f.costEur),
          operatorName: f.operatorName == null ? null : String(f.operatorName),
          tariff: f.tariff == null ? null : String(f.tariff),
          issuedAt: f.issuedAt == null ? null : String(f.issuedAt),
          periodStart: f.periodStart == null ? null : String(f.periodStart),
          periodEnd: f.periodEnd == null ? null : String(f.periodEnd),
          readings: Array.isArray(f.readings) ? (f.readings as InvoiceReading[]) : null,
          notes: Array.isArray(f.notes) ? (f.notes as string[]) : [],
          createdAt: existente?.createdAt ?? new Date().toISOString(),
          pdfData,
          hasPdf: !!pdfData,
        };
        await d.invoices.put(fatura);
        idsTocadas.invoices.push(fatura.id);
      }

      return {
        casas: { criadas: casasCriadas, total: corpo.houses.length },
        registos: { criados, atualizados, total: corpo.readings.length },
        operadores,
      };
    }
  );

  // o que foi importado sobe para a nuvem para os outros aparelhos
  for (const t of Object.keys(idsTocadas) as TabelaSync[]) {
    for (const id of idsTocadas[t]) marcarDirty(t, id);
  }
  agendarEnvio();
  return resultado;
}

// ============================================================
// Sincronização — UMA verdade para todos os aparelhos
// ============================================================
// O documento central vive no Vercel Blob (via /api/data). A cópia local
// (IndexedDB) continua a ser o que a app mostra — rápida e funciona sem
// internet. Quando há internet:
//   · cada alteração sobe para a nuvem depois de 2,5 s (para juntar toques);
//   · a cada 30 s e sempre que a app volta ao primeiro plano, ela traz o
//     que os outros aparelhos gravaram e junta ao local (por id; ganha o
//     registo com o updatedAt mais recente);
//   · os PDFs das faturas sobem para a nuvem e ficam abertos a todos.
// Os apagados viajam como «lápides» para nada ressuscitar.

type TabelaSync = "houses" | "readings" | "operators" | "invoices";

const TABELAS_SYNC: TabelaSync[] = ["houses", "readings", "operators", "invoices"];

type RegistoSync = Record<string, unknown> & { id: string; updatedAt?: string };

type DocCentral = {
  houses: Record<string, RegistoSync>;
  readings: Record<string, RegistoSync>;
  operators: Record<string, RegistoSync>;
  invoices: Record<string, RegistoSync>;
  deleted: { t: string; id: string; at: string }[];
  rev: number;
};

export type EstadoSync = "sincronizado" | "a-sincronizar" | "sem-internet" | "erro";

const CHAVE_FILA = "sync-fila-v1";
const CHAVE_FEITO = "sync-feito-v1";

let fila = new Map<TabelaSync, Set<string>>();
let tumboPendentes: { t: TabelaSync; id: string; at: string }[] = [];
let cronometro: ReturnType<typeof setTimeout> | null = null;
let arrancou = false;
let aCorrer = false;
let sincInicialFeito = false;
let estadoSync: EstadoSync = "sincronizado";
let ultimaSyncAt: string | null = null;
const ouvintesSync = new Set<(e: EstadoSync, ultima: string | null) => void>();
const ouvintesDados = new Set<() => void>();

function definirEstado(e: EstadoSync) {
  if (estadoSync === e) return;
  estadoSync = e;
  for (const f of ouvintesSync) f(estadoSync, ultimaSyncAt);
}

// a app (cabeçalho) subscreve para mostrar o estado da sincronização
export function subscribeSync(
  cb: (e: EstadoSync, ultima: string | null) => void
): () => void {
  ouvintesSync.add(cb);
  cb(estadoSync, ultimaSyncAt);
  return () => ouvintesSync.delete(cb);
}

// a página mostra logo o que chegou da nuvem
export function onDadosRemotos(cb: () => void): () => void {
  ouvintesDados.add(cb);
  return () => ouvintesDados.delete(cb);
}

export function estadoSyncAtual(): { estado: EstadoSync; ultima: string | null } {
  return { estado: estadoSync, ultima: ultimaSyncAt };
}

export function syncAgora(): void {
  if (cronometro) {
    clearTimeout(cronometro);
    cronometro = null;
  }
  void cicloSync();
}

function marcarDirty(t: TabelaSync, id: string) {
  let s = fila.get(t);
  if (!s) {
    s = new Set();
    fila.set(t, s);
  }
  s.add(id);
}

function apagarRegisto(t: TabelaSync, id: string) {
  tumboPendentes.push({ t, id, at: new Date().toISOString() });
  const s = fila.get(t);
  if (s) {
    s.delete(id);
    if (s.size === 0) fila.delete(t);
  }
}

function guardarFila() {
  try {
    void db().meta.put({
      key: CHAVE_FILA,
      value: JSON.stringify({
        dirty: Object.fromEntries([...fila].map(([t, s]) => [t, [...s]])),
        tumbo: tumboPendentes,
      }),
    });
  } catch {
    // fora do navegador não há fila a guardar
  }
}

function agendarEnvio() {
  guardarFila();
  if (cronometro) clearTimeout(cronometro);
  cronometro = setTimeout(() => {
    cronometro = null;
    void cicloSync();
  }, 2500);
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? false : navigator.onLine !== false;
}

function tabelaDe(t: TabelaSync): Table<RegistoSync, string> {
  const d = db();
  const tab =
    t === "houses" ? d.houses : t === "readings" ? d.readings : t === "operators" ? d.operators : d.invoices;
  return tab as unknown as Table<RegistoSync, string>;
}

async function limparPdfNuvemUrl(url: string) {
  try {
    await fetch(`/api/invoice?url=${encodeURIComponent(url)}`, { method: "DELETE" });
  } catch {
    // melhor-esforço: se falhar, o PDF velho fica lá sem incomodar
  }
}

// sobe o PDF deste aparelho para a nuvem e guarda o url público na fatura
async function carregarPdfNuvem(id: string): Promise<string | null> {
  const d = db();
  const inv = await d.invoices.get(id);
  if (!inv?.pdfData || inv.pdfUrl) return inv?.pdfUrl ?? null;
  const urlAntigo = inv.pdfUrl ?? null;
  try {
    const form = new FormData();
    form.append("file", inv.pdfData, `${id}.pdf`);
    form.append("pathname", `${id}-${Date.now()}`);
    const res = await fetch("/api/invoice", { method: "POST", body: form });
    if (!res.ok) throw new Error("falhou a subida do PDF");
    const r = (await res.json()) as { url: string };
    await d.invoices.put({
      ...inv,
      pdfUrl: r.url,
      hasPdf: true,
      updatedAt: inv.updatedAt ?? new Date().toISOString(),
    });
    marcarDirty("invoices", id);
    agendarEnvio();
    if (urlAntigo) void limparPdfNuvemUrl(urlAntigo);
    return r.url;
  } catch {
    return null;
  }
}

// traz a nuvem e junta ao local (ganha o updatedAt mais recente)
async function puxar(): Promise<DocCentral | null> {
  const res = await fetch(`/api/data?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("falhou a leitura da nuvem");
  const remoto = (await res.json()) as DocCentral | null;
  if (!remoto) return null;

  let mudouAlgo = false;

  for (const t of TABELAS_SYNC) {
    const mapa = remoto[t] ?? {};
    for (const id of Object.keys(mapa)) {
      const rem = mapa[id];
      if (!rem || rem.id !== id) continue;
      const remAt = typeof rem.updatedAt === "string" ? rem.updatedAt : "";
      if (!remAt) continue;
      const loc = (await tabelaDe(t).get(id)) as RegistoSync | undefined;
      if (loc) {
        const locAt = typeof loc.updatedAt === "string" ? loc.updatedAt : "";
        if (remAt <= locAt) continue;
      }
      if (t === "invoices") {
        const locInv = loc as unknown as LocalInvoice | undefined;
        const remInv = rem as unknown as LocalInvoice;
        const pdfUrlFinal = remInv.pdfUrl ?? locInv?.pdfUrl ?? null;
        const novo: LocalInvoice = {
          ...remInv,
          pdfData: locInv?.pdfData ?? null,
          pdfUrl: pdfUrlFinal,
          hasPdf: !!locInv?.pdfData || !!pdfUrlFinal,
        };
        await tabelaDe(t).put(novo as unknown as RegistoSync);
      } else {
        await tabelaDe(t).put(rem);
      }
      mudouAlgo = true;
    }
  }

  // o que outro aparelho apagou também se apaga aqui
  for (const tb of remoto.deleted ?? []) {
    if (!TABELAS_SYNC.includes(tb.t as TabelaSync)) continue;
    const tabela = tabelaDe(tb.t as TabelaSync);
    const loc = (await tabela.get(tb.id)) as RegistoSync | undefined;
    if (!loc) continue;
    const locAt = typeof loc.updatedAt === "string" ? loc.updatedAt : "";
    if (!locAt || tb.at >= locAt) {
      await tabela.delete(tb.id);
      mudouAlgo = true;
    }
  }

  if (mudouAlgo) for (const f of ouvintesDados) f();
  return remoto;
}

function limparParaNuvem(t: TabelaSync, r: RegistoSync): RegistoSync {
  const copia: Record<string, unknown> = { ...r };
  delete copia.pdfData;
  if (t === "houses") delete copia.readingsCount;
  if (t === "invoices") copia.hasPdf = true;
  if (!copia.updatedAt) copia.updatedAt = new Date().toISOString();
  return copia as RegistoSync;
}

// envia o que está na fila (registos + lápides) para a nuvem
async function enviarFila(): Promise<void> {
  if (fila.size === 0 && tumboPendentes.length === 0) return;
  const payload: {
    houses?: RegistoSync[];
    readings?: RegistoSync[];
    operators?: RegistoSync[];
    invoices?: RegistoSync[];
    deleted?: { t: string; id: string; at: string }[];
  } = {};
  let haAlgo = false;
  for (const t of TABELAS_SYNC) {
    const ids = fila.get(t);
    if (!ids || ids.size === 0) continue;
    const lista: RegistoSync[] = [];
    for (const id of ids) {
      const r = await tabelaDe(t).get(id);
      if (!r) continue;
      lista.push(limparParaNuvem(t, r));
    }
    if (lista.length) {
      payload[t] = lista;
      haAlgo = true;
    }
  }
  if (tumboPendentes.length) {
    payload.deleted = tumboPendentes;
    haAlgo = true;
  }
  if (!haAlgo) {
    fila.clear();
    tumboPendentes = [];
    return;
  }

  const res = await fetch("/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("falhou o envio para a nuvem");

  fila.clear();
  tumboPendentes = [];
  await puxar();
}

async function cicloSync(): Promise<void> {
  if (aCorrer) return;
  if (!isOnline()) {
    definirEstado("sem-internet");
    return;
  }
  aCorrer = true;
  const temTrabalho = fila.size > 0 || tumboPendentes.length > 0 || !sincInicialFeito;
  if (temTrabalho) definirEstado("a-sincronizar");
  const pdfFalhados: string[] = [];
  try {
    // 1) subir PDFs que estão na fila (só existem neste aparelho)
    for (const id of [...(fila.get("invoices") ?? [])]) {
      if ((await carregarPdfNuvem(id)) === null) pdfFalhados.push(id);
    }

    // 2) trazer a nuvem e juntar ao local
    const remoto = await puxar();

    // 3) reconciliar: tudo o que a nuvem não conhece sobe — é isto que faz a
    //    primeira sincronização de um aparelho novo e que cura qualquer gravação
    //    perdida entre dois aparelhos. Apagados noutra casa não ressuscitam.
    const tumboAt = new Map<string, string>();
    for (const tb of remoto?.deleted ?? []) tumboAt.set(`${tb.t}:${tb.id}`, tb.at);
    for (const t of TABELAS_SYNC) {
      const todos = await tabelaDe(t).toArray();
      for (const r of todos) {
        const id = String(r.id);
        const at = (r as RegistoSync).updatedAt;
        const tomba = tumboAt.get(`${t}:${id}`);
        if (tomba && (!at || tomba >= at)) continue;
        if (!remoto || !remoto[t]?.[id]) {
          marcarDirty(t, id);
        } else if (t === "invoices") {
          const inv = r as unknown as LocalInvoice;
          if (inv.pdfData && !inv.pdfUrl) marcarDirty(t, id);
        }
      }
    }

    // 4) enviar tudo o que ficou marcado
    await enviarFila();

    sincInicialFeito = true;
    try {
      await db().meta.put({ key: CHAVE_FEITO, value: new Date().toISOString() });
    } catch {
      // sem meta, tentamos de novo no próximo ciclo
    }
    ultimaSyncAt = new Date().toISOString();
    definirEstado("sincronizado");
  } catch {
    definirEstado(isOnline() ? "erro" : "sem-internet");
  } finally {
    aCorrer = false;
    // PDFs que não subiram ficam na fila para tentar outra vez
    for (const id of pdfFalhados) marcarDirty("invoices", id);
    guardarFila();
  }
}

// arranca uma única vez por visita: recupera a fila pendente e agenda ciclos
export async function arrancarSync(): Promise<void> {
  if (arrancou || typeof window === "undefined") return;
  arrancou = true;
  try {
    const m = await db().meta.get(CHAVE_FILA);
    if (m?.value) {
      const g = JSON.parse(m.value) as {
        dirty?: Record<string, string[]>;
        tumbo?: { t: TabelaSync; id: string; at: string }[];
      };
      if (g.dirty) {
        for (const [t, ids] of Object.entries(g.dirty)) {
          const s = fila.get(t as TabelaSync) ?? new Set<string>();
          for (const id of ids) s.add(id);
          fila.set(t as TabelaSync, s);
        }
      }
      if (Array.isArray(g.tumbo)) tumboPendentes = g.tumbo;
    }
  } catch {
    // sem fila guardada, seguimos
  }
  void cicloSync();
  setInterval(() => void cicloSync(), 30000);
  window.addEventListener("online", () => void cicloSync());
  window.addEventListener("offline", () => definirEstado("sem-internet"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void cicloSync();
  });
}
