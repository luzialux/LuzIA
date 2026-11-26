// Lê o texto de uma fatura de eletricidade (PDF já transformado em texto) e
// tira os dados que interessam: período, consumo, valor, leituras do contador,
// operador e tarifa. Feito à medida das faturas portuguesas (SU Eletricidade,
// EDP, Galp, Endesa, Iberdrola, Plenitude, Goldenergy, ...).

export type InvoiceReading = {
  label: string; // ex.: "Vazio", "Ponta", "Cheias"
  previous: number | null; // leitura no início do período
  current: number | null; // leitura no fim do período
};

export type ParsedInvoice = {
  operatorName: string | null;
  issuedAt: string | null; // ISO
  periodStart: string | null; // ISO
  periodEnd: string | null; // ISO
  month: number | null; // mês a que a fatura diz respeito (data final do período)
  year: number | null;
  kwh: number | null;
  costEur: number | null;
  tariff: string | null;
  readings: InvoiceReading[];
  readingsCheckOk: boolean; // as leituras batem certo com o consumo?
  notes: string[]; // o que se conseguiu ler (para mostrar ao utilizador)
};

// ---- meses: "jan"... "dez", "janeiro"... "dezembro" ----
const MESES_TOKEN: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8,
  set: 9, out: 10, nov: 11, dez: 12,
};

function mesNum(token: string): number | null {
  const t = token.toLowerCase().replace(/[^a-zç]/g, "");
  return MESES_TOKEN[t] ?? null;
}

// ---- deteção do operador pela marca no texto ----
const OPERADOR_PADROES: [RegExp, string][] = [
  [/su\s*eletricidade|sueletricidade\.pt/i, "SU Eletricidade"],
  [/edp\b|edenred/i, "EDP Comercial"],
  [/endesa/i, "Endesa"],
  [/iberdrola/i, "Iberdrola"],
  [/galp/i, "Galp"],
  [/plenitude|\beni\b/i, "Plenitude (Eni)"],
  [/goldenergy/i, "Goldenergy"],
  [/meo\s*energia|meoenergia/i, "MEO Energia"],
  [/yes\s*energy/i, "Yes Energy"],
  [/repsol/i, "Repsol"],
  [/ytap/i, "Ytap"],
  [/cleanly/i, "Cleanly"],
  [/octopus/i, "Octopus Energy"],
];

function detetarOperador(texto: string): string | null {
  for (const [re, nome] of OPERADOR_PADROES) {
    if (re.test(texto)) return nome;
  }
  return null;
}

// "5 219" ou "5219" ou "5.219" -> 5219
function num(texto: string): number | null {
  const limpo = texto.replace(/\s+/g, "").replace(/\./g, "").replace(/,/g, ".");
  const v = parseFloat(limpo);
  return Number.isFinite(v) ? v : null;
}

function dataISO(dia: number, mes: number, ano: number): string {
  return new Date(Date.UTC(ano, mes - 1, Math.min(dia, 28), 12)).toISOString();
}

// Captura "21 out 2026" e devolve [dia, mês, ano]
const RE_DATA = /(\d{1,2})\s+([a-zç]{3,9}\.?)\s+(\d{4})/i;

export function parseInvoiceText(bruto: string): ParsedInvoice {
  // texto em linhas para afrontar quebras; e uma versão "plana" para regexes
  const plano = bruto.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ");
  const notes: string[] = [];
  const res: ParsedInvoice = {
    operatorName: null, issuedAt: null, periodStart: null, periodEnd: null,
    month: null, year: null, kwh: null, costEur: null, tariff: null,
    readings: [], readingsCheckOk: false, notes,
  };

  // ---- operador ----
  res.operatorName = detetarOperador(plano);
  if (res.operatorName) notes.push(`Operador detetado: ${res.operatorName}.`);

  // ---- período de faturação: "21 out 2026 até 20 nov 2026" ----
  const mPer = plano.match(
    /per[íi]odo\s+de\s+fatura[çc][ãa]o\s*:?\s*[^]{0,40}?(\d{1,2})\s+([a-zç]{3,9}\.?)\s+(\d{4})\s+(?:at[ée]|\ba\b|a)\s+(\d{1,2})\s+([a-zç]{3,9}\.?)\s+(\d{4})/i
  );
  if (mPer) {
    const d1 = +mPer[1], m1 = mesNum(mPer[2]), a1 = +mPer[3];
    const d2 = +mPer[4], m2 = mesNum(mPer[5]), a2 = +mPer[6];
    if (m1 && m2) {
      res.periodStart = dataISO(d1, m1, a1);
      res.periodEnd = dataISO(d2, m2, a2);
      res.month = m2;
      res.year = a2;
      notes.push(
        `Período de faturação: ${d1}/${String(m1).padStart(2, "0")}/${a1} a ${d2}/${String(m2).padStart(2, "0")}/${a2}.`
      );
    }
  }

  // ---- data de emissão ----
  const mEmi = plano.match(/data\s+de\s+emiss[ãa]o\s*:?\s*([^]{0,40})/i);
  if (mEmi) {
    const m = mEmi[1].match(RE_DATA);
    if (m) {
      const mes = mesNum(m[2]);
      if (mes) {
        res.issuedAt = dataISO(+m[1], mes, +m[3]);
        notes.push(`Fatura emitida em ${m[1]} ${m[2]} ${m[3]}.`);
      }
    }
  }

  // ---- consumo em kWh ----
  const tentativasKwh = [
    /consumo\s+entre\s+leituras\s*:?\s*([\d.,\s]+?)\s*kwh/i,
    /consumo\s+real\s*\(([\d.,\s]+?)\s*kwh/i,
    /consumo\s+total\s*:?\s*([\d.,\s]+?)\s*kwh/i,
    /consumo\s+ativo\s*\(([\d.,\s]+?)\s*kwh/i,
  ];
  for (const re of tentativasKwh) {
    const m = plano.match(re);
    if (m) {
      const v = num(m[1]);
      if (v != null && v > 0 && v < 5000) {
        res.kwh = v;
        notes.push(`Consumo lido na fatura: ${Math.round(v)} kWh.`);
        break;
      }
    }
  }

  // ---- valor da fatura ----
  const tentativasValor = [
    /valor\s+da\s+fatura\s*[:(]?\s*(\d{1,6}[.,]\d{2})\s*€/i,
    /total\s+a\s+pagar\s*[:(]?\s*(\d{1,6}[.,]\d{2})\s*€/i,
    /valor\s+total\s+da\s+fatura\s*[:(]?\s*(\d{1,6}[.,]\d{2})\s*€/i,
    /valor\s+total\s*[:(]?\s*(\d{1,6}[.,]\d{2})\s*€/i,
  ];
  for (const re of tentativasValor) {
    const m = plano.match(re);
    if (m) {
      const v = num(m[1]);
      if (v != null && v > 0) {
        res.costEur = v;
        notes.push(`Valor da fatura: ${v.toFixed(2).replace(".", ",")} €.`);
        break;
      }
    }
  }

  // ---- tarifa ----
  const mTar = plano.match(/tarifa\s*:?\s*(tri-hor[áa]ria|bi-hor[áa]ria|simples|mon[óo]ria)/i);
  if (mTar) {
    res.tariff = mTar[1][0].toUpperCase() + mTar[1].slice(1).toLowerCase();
    notes.push(`Tarifa: ${res.tariff}.`);
  }

  // ---- leituras do contador por período (vazio / ponta / cheias) ----
  // no texto da fatura aparecem pares: "Vazio: 5 219 Vazio: 5 440" (a 1.ª
  // ocorrência de cada rótulo é a leitura anterior, a 2.ª é a atual)
  const rotulos: [string, string][] = [
    ["Vazio", "vazio"],
    ["Ponta", "ponta"],
    ["Cheias", "cheias"],
  ];
  const reRotulo = /(vazio|ponta|cheias)\s*:?\s*([\d\s.,]{1,14})/gi;
  const porRotulo: Record<string, number[]> = { vazio: [], ponta: [], cheias: [] };
  let mRot: RegExpExecArray | null;
  while ((mRot = reRotulo.exec(plano)) !== null) {
    const val = num(mRot[2]);
    if (val != null) porRotulo[mRot[1].toLowerCase()].push(val);
  }
  let somaDif = 0;
  let temLeituras = false;
  for (const [rot, rotMin] of rotulos) {
    const vals = porRotulo[rotMin];
    if (vals.length >= 2) {
      res.readings.push({ label: rot, previous: vals[0], current: vals[1] });
      temLeituras = true;
      somaDif += Math.max(0, vals[1] - vals[0]);
    }
  }
  if (temLeituras) {
    notes.push(
      "Leituras do contador: " +
        res.readings
          .map((r) => `${r.label} ${r.previous} → ${r.current}`)
          .join("; ") + "."
    );
    if (res.kwh != null && Math.abs(somaDif - res.kwh) < 2) {
      res.readingsCheckOk = true;
      notes.push("As leituras batem certo com o consumo da fatura.");
    }
  }

  return res;
}
