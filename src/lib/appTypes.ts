// Tipos e funções partilhadas por toda a app

export type House = {
  id: string;
  name: string;
  color: string;
  readingsCount?: number;
  updatedAt?: string; // sincronização: quem editou por último
};

export type Reading = {
  id: string;
  houseId: string;
  houseName: string;
  houseColor: string;
  year: number;
  month: number; // 1..12
  kwh: number | null;
  costEur: number | null;
  counterValue: number | null;
  updatedAt?: string; // sincronização: quem editou por último
};

export type Operator = {
  id: string;
  name: string;
  brandColor: string;
  website: string;
  isNewPlayer: boolean;
  offerTitle: string | null;
  offerSummary: string | null;
  bonusEur: number | null;
  priceKwh: string | null;
  conditions: string | null;
  sourceUrl: string | null;
  sortOrder: number;
  updatedAt?: string; // sincronização: quem editou por último
};

// uma fatura guardada no arquivo
export type InvoiceReading = {
  label: string; // ex.: "Vazio"
  previous: number | null;
  current: number | null;
};

export type Invoice = {
  id: string;
  houseId: string;
  houseName: string;
  houseColor: string;
  fileName: string;
  fileSize: number;
  year: number;
  month: number;
  kwh: number | null;
  costEur: number | null;
  operatorName: string | null;
  tariff: string | null;
  issuedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  readings: InvoiceReading[] | null;
  notes: string[];
  createdAt: string;
  // true quando o PDF está guardado neste aparelho (a fatura semeada vem sem PDF)
  hasPdf?: boolean;
  // endereço público do PDF na nuvem — qualquer aparelho abre por aqui
  pdfUrl?: string | null;
  updatedAt?: string; // sincronização: quem editou por último
};

// o que a app leu sozinho de uma fatura que acabou de ser carregada
export type ExtractedInvoice = {
  month: number;
  year: number;
  kwh: number | null;
  costEur: number | null;
  operatorName: string | null;
  tariff: string | null;
  periodStart: string | null; // início do período de consumo (ISO), se leu
  periodEnd: string | null; // fim do período de consumo (ISO), se leu
  readings: InvoiceReading[];
  readingsCheckOk: boolean;
  notes: string[];
  mesEstimadoPor: string | null; // se o mês foi adivinhado, porquê
};

export const fmtFileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} kB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const nf = new Intl.NumberFormat("pt-PT");
const nf2 = new Intl.NumberFormat("pt-PT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const fmtKwh = (v: number | null | undefined) =>
  v == null ? "—" : `${nf.format(v)} kWh`;

export const fmtNum = (v: number | null | undefined) =>
  v == null ? "—" : nf.format(v);

export const fmtEur = (v: number | null | undefined) =>
  v == null ? "—" : `${nf2.format(v)} €`;

export const fmtCounter = (v: number | null | undefined) =>
  v == null ? "—" : nf.format(v);

// rótulo curto do mês, ex.: "nov/26"
export const monthLabel = (year: number, month: number) =>
  `${MES_ABREV[month - 1]}/${String(year).slice(2)}`;

export const monthLabelLong = (year: number, month: number) =>
  `${MESES[month - 1]} de ${year}`;

// mistura uma cor com branco (para escurecer/embranquecer conforme o tema)
export function mix(hex: string, withWhite: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const mixd = (c: number) => Math.round(c + (255 - c) * withWhite);
  return `#${[mixd(r), mixd(g), mixd(b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

export const monthKey = (year: number, month: number) => year * 12 + month;

export const fromMonthKey = (key: number) => ({
  year: Math.floor((key - 1) / 12),
  month: ((key - 1) % 12) + 1,
});

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function isPastOrCurrent(year: number, month: number) {
  const now = new Date();
  return (
    year < now.getFullYear() ||
    (year === now.getFullYear() && month <= now.getMonth() + 1)
  );
}
