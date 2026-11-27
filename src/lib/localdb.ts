// Base de dados da LuzIA — vive 100% dentro do navegador (IndexedDB).
// Substituiu o servidor: nada se perde se a internet falhar e não há contas
// nem bases de dados na nuvem. As regras de guardar/calcular são as mesmas
// que a app sempre usou.

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
    await d.houses.put({ ...existente, name: dados.name, color: dados.color });
    // o nome aparece nas leituras e faturas guardadas — atualiza também
    await d.readings.where("houseId").equals(id).modify({
      houseName: dados.name,
      houseColor: dados.color,
    });
    await d.invoices.where("houseId").equals(id).modify({
      houseName: dados.name,
      houseColor: dados.color,
    });
    return;
  }
  const nova: DbHouse = {
    id: crypto.randomUUID(),
    name: dados.name,
    color: dados.color,
    createdAt: new Date().toISOString(),
  };
  await d.houses.add(nova);
}

export async function deleteHouse(id: string): Promise<void> {
  const d = db();
  await d.transaction("rw", d.houses, d.readings, d.invoices, async () => {
    await d.houses.delete(id);
    await d.readings.where("houseId").equals(id).delete();
    await d.invoices.where("houseId").equals(id).delete();
  });
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
  };
  await d.readings.put(registo);
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
  };
  await d.readings.put(registo);
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
  await d.readings.put({ ...r, kwh, costEur });
}

export async function deleteReading(id: string): Promise<void> {
  await db().readings.delete(id);
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
    await d.operators.put({ ...existente, ...dados });
    return;
  }
  const todas = await d.operators.toArray();
  const maxOrdem = todas.reduce((m, o) => Math.max(m, o.sortOrder), 0);
  await d.operators.add({ ...dados, id: crypto.randomUUID(), sortOrder: maxOrdem + 1 });
}

export async function deleteOperator(id: string): Promise<void> {
  await db().operators.delete(id);
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
  await d.readings.put({
    id: leituraExistente?.id ?? crypto.randomUUID(),
    houseId,
    houseName: casa.name,
    houseColor: casa.color,
    year: parsed.year,
    month: parsed.month,
    kwh: parsed.kwh ?? leituraExistente?.kwh ?? null,
    costEur: parsed.costEur ?? leituraExistente?.costEur ?? null,
    counterValue: leituraExistente?.counterValue ?? null,
  });

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
    hasPdf: true,
  };
  await d.invoices.put(fatura);

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
  await db().invoices.delete(id);
}

export async function getInvoicePdfUrl(id: string): Promise<string | null> {
  const inv = await db().invoices.get(id);
  if (!inv?.pdfData) return null;
  return URL.createObjectURL(inv.pdfData);
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
    if (f.pdfData) item.pdfBase64 = await blobParaBase64(f.pdfData);
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

  return d.transaction(
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
            await d.houses.put({ ...existente, color });
          }
          idPorNome.set(name, existente.id);
        } else {
          const nova: DbHouse = {
            id: crypto.randomUUID(),
            name,
            color,
            createdAt: new Date().toISOString(),
          };
          await d.houses.add(nova);
          idPorNome.set(name, nova.id);
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
          });
          atualizados++;
        } else {
          await d.readings.add({
            id: crypto.randomUUID(),
            houseId,
            houseName: casa?.name ?? String(r.house ?? ""),
            houseColor: casa?.color ?? "#64748B",
            year,
            month,
            kwh,
            costEur,
            counterValue,
          });
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
        if (existente) await d.operators.put({ ...existente, ...dados });
        else await d.operators.add({ ...dados, id: crypto.randomUUID() });
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
      }

      return {
        casas: { criadas: casasCriadas, total: corpo.houses.length },
        registos: { criados, atualizados, total: corpo.readings.length },
        operadores,
      };
    }
  );
}
