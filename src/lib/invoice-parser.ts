// Lê o texto de uma fatura de eletricidade (PDF já transformado em texto) e
// tira os dados que interessam: período, consumo, valor, leituras do contador,
// operador e tarifa. Feito à medida das faturas portuguesas — e tolerante:
// aceita datas por extenso ("21 out 2026") e numéricas ("21/10/2026"),
// funciona mesmo quando o PDF perde os acentos, e conhece os jeitões das
// faturas da SU Eletricidade, EDP, Galp, Endesa, Iberdrola, Plenitude,
// Goldenergy, TotalEnergies, LUZON, Energia Simples, ...

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
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8,
  set: 9, sept: 9, out: 10, nov: 11, dez: 12,
};

function mesNum(token: string): number | null {
  const t = token.toLowerCase().replace(/[^a-z]/g, "");
  return MESES_TOKEN[t] ?? null;
}

// ---- deteção do operador pela marca no texto ----
// (o EDP fica para o fim e ignora "EDP Distribuição", que é a rede e aparece
// em todas as faturas por cima de quem vende a luz)
const OPERADOR_PADROES: [RegExp, string][] = [
  [/su\s*eletricidade|sueletricidade\.pt|suft\d{3,}/i, "SU Eletricidade"],
  [/endesa/i, "Endesa"],
  [/galp/i, "Galp"],
  [/plenitude|\beni\b/i, "Plenitude (Eni)"],
  [/gold\s*energy|goldenergy/i, "Goldenergy"],
  [/iberdrola/i, "Iberdrola"],
  [/totalenergies|total\s*energies/i, "TotalEnergies"],
  [/luzon/i, "LUZON"],
  [/energia\s*simples/i, "Energia Simples"],
  [/\belabe\b/i, "Elabe"],
  [/meo\s*energia|meoenergia/i, "MEO Energia"],
  [/yes\s*energy/i, "Yes Energy"],
  [/repsol/i, "Repsol"],
  [/ytap/i, "Ytap"],
  [/cleanly/i, "Cleanly"],
  [/octopus/i, "Octopus Energy"],
  [/edp(?!\s*distribui)/i, "EDP Comercial"],
];

function detetarOperador(texto: string): string | null {
  for (const [re, nome] of OPERADOR_PADROES) {
    if (re.test(texto)) return nome;
  }
  return null;
}

// "5 219" ou "5219" ou "5.219" ou "1.234,56" -> número
function num(texto: string): number | null {
  const limpo = texto.replace(/\s+/g, "").replace(/\./g, "").replace(/,/g, ".");
  const v = parseFloat(limpo);
  return Number.isFinite(v) ? v : null;
}

function dataISO(dia: number, mes: number, ano: number): string {
  return new Date(Date.UTC(ano, mes - 1, Math.min(dia, 28), 12)).toISOString();
}

// ---- tirar os acentos (comprimento mantém-se, para os índices baterem) ----
function chaoDe(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàâãä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôõö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/ç/g, "c");
}

// ---- procurar todas as datas no texto ----
type DataAchada = { idx: number; dia: number; mes: number; ano: number };

function diaEmMs(d: DataAchada): number {
  return Date.UTC(d.ano, d.mes - 1, d.dia);
}

function acharDatas(chao: string): DataAchada[] {
  const datas: DataAchada[] = [];
  const ranges: [number, number][] = [];
  const dentro = (i: number, n: number) =>
    ranges.some(([a, b]) => i >= a && i + n <= b);
  const push = (idx: number, dia: number, mes: number, ano: number, n: number) => {
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && ano >= 2000 && ano <= 2099) {
      if (!dentro(idx, n)) {
        datas.push({ idx, dia, mes, ano });
        ranges.push([idx, idx + n]);
      }
    }
  };

  // "2026-11-20"
  for (const m of chao.matchAll(/(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})/g)) {
    push(m.index, +m[3], +m[2], +m[1], m[0].length);
  }
  // "21/10/2026", "21-10-2026", "21.10.26"
  for (const m of chao.matchAll(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})/g)) {
    let ano = +m[3];
    if (ano < 100) ano += 2000;
    push(m.index, +m[1], +m[2], ano, m[0].length);
  }
  // "21 out 2026" / "21 de outubro de 2026"
  for (const m of chao.matchAll(/(\d{1,2})\s+(?:de\s+)?([a-z]{3,10})\.?(?:\s+de)?\s+(\d{4})/g)) {
    const mes = mesNum(m[2]);
    if (mes) push(m.index, +m[1], mes, +m[3], m[0].length);
  }
  return datas.sort((a, b) => a.idx - b.idx);
}

// ---- período de faturação ----
const PALAVRAS_PERIODO = [
  "periodo de faturacao", "periodos de faturacao", "periodo de consumo",
  "periodo facturado", "periodo faturado", "periodo de fornecimento",
  "periodo de leitura", "periodo de fatura",
];

function acharPeriodo(
  chao: string,
  datas: DataAchada[]
): { inicio: DataAchada | null; fim: DataAchada | null; como: string } {
  // 1.º tentativa: datas mesmo ao lado de "período de faturação" (ou parecido)
  for (const palavra of PALAVRAS_PERIODO) {
    let i = chao.indexOf(palavra);
    while (i !== -1) {
      const janela = datas.filter((d) => d.idx >= i && d.idx <= i + palavra.length + 120);
      if (janela.length >= 2) {
        return { inicio: janela[0], fim: janela[1], como: palavra };
      }
      i = chao.indexOf(palavra, i + 1);
    }
  }
  // 2.ª tentativa: o primeiro par de datas seguidas que pareça um mês de faturação
  // (evita a data de emissão, a de pagamento e a do fim do contrato)
  const contextoAntes = (d: DataAchada) => chao.slice(Math.max(0, d.idx - 32), d.idx);
  const dataEstranha = /(emiss|pague|termina|valida|vencimento|proximo|garant|atest|nasc)/;
  const tentativas: [number, number][] = [[20, 45], [3, 150]];
  for (const [minDias, maxDias] of tentativas) {
    for (let a = 0; a < datas.length; a++) {
      if (dataEstranha.test(contextoAntes(datas[a]))) continue;
      for (let b = a + 1; b < datas.length; b++) {
        if (dataEstranha.test(contextoAntes(datas[b]))) continue;
        const dias = (diaEmMs(datas[b]) - diaEmMs(datas[a])) / 86400000;
        if (dias >= minDias && dias <= maxDias) {
          return { inicio: datas[a], fim: datas[b], como: "duas datas seguidas" };
        }
      }
    }
  }
  return { inicio: null, fim: null, como: "" };
}

function acharEmissao(chao: string, datas: DataAchada[]): DataAchada | null {
  for (const palavra of ["data de emissao", "data do documento", "emitida em", "emitido em", "emitida a"]) {
    const i = chao.indexOf(palavra);
    if (i !== -1) {
      const perto = datas.find((d) => d.idx >= i && d.idx <= i + palavra.length + 60);
      if (perto) return perto;
    }
  }
  return datas[0] ?? null;
}

// ---- consumo em kWh ----
function acharConsumo(chao: string): { kwh: number | null; como: string } {
  const validos: [RegExp, string][] = [
    [/consumo\s+entre\s+leituras:?\s*([\d.,\s]+?)\s*kwh/, "consumo entre leituras"],
    [/consumo\s+real\s*\(([\d.,\s]+?)\s*kwh/, "consumo real"],
    [/consumo\s+(?:total|do\s+periodo|faturado|facturado|ativo|registado|registrado|medido|mensal):?\s*([\d.,\s]+?)\s*kwh/, "consumo do período"],
    [/total\s+(?:de\s+)?(?:energia\s+)?consumida:?\s*([\d.,\s]+?)\s*kwh/, "total de energia consumida"],
    [/energia\s+(?:ativa\s+)?(?:consumida|faturada|facturada|el[ée]trica)[a-z ]{0,25}?:?\s*([\d.,\s]+?)\s*kwh/, "energia consumida"],
  ];
  for (const [re, como] of validos) {
    const m = chao.match(re);
    if (m) {
      const v = num(m[1]);
      if (v != null && v > 0 && v < 10000) return { kwh: v, como };
    }
  }
  // "consumo de eletricidade 320 kWh" (e também "320 kWh consumidos")
  const reFrente = /consumo[^\n]{0,45}?(\d{1,5}(?:\.\d{3})*(?:[.,]\d{1,3})?)\s*kwh/g;
  for (const m of chao.matchAll(reFrente)) {
    if (/(medio|diario|med\.)/.test(chao.slice(Math.max(0, m.index - 24), m.index))) continue;
    const v = num(m[1]);
    if (v != null && v > 0 && v < 10000) return { kwh: v, como: "consumo" };
  }
  const reTras = /(\d{1,5}(?:\.\d{3})*(?:[.,]\d{1,3})?)\s*kwh[^\n]{0,25}consum/g;
  for (const m of chao.matchAll(reTras)) {
    const v = num(m[1]);
    if (v != null && v > 0 && v < 10000) return { kwh: v, como: "consumo" };
  }
  // soma dos consumos por período horário: "Vazio 180,5 kWh" + "Fora de Vazio 95,25 kWh"
  const rePeriodo = /(fora de vazio|vazio|ponta|cheias|normal)\s*:?\s*([\d.,]+)\s*kwh/g;
  let soma = 0;
  let partes = 0;
  for (const m of chao.matchAll(rePeriodo)) {
    const v = num(m[2]);
    if (v != null && v >= 0 && v < 5000) {
      soma += v;
      partes++;
    }
  }
  if (partes >= 2 && soma > 0 && soma < 10000) {
    return { kwh: soma, como: "soma dos consumos por período horário" };
  }
  return { kwh: null, como: "" };
}

// ---- valor da fatura ----
function acharDinheiro(janela: string): number | null {
  const candidatos = [
    janela.match(/(?:€|eur)\s*(\d{1,3}(?:[ .]\d{3})*(?:,\d{1,2})?|\d+,\d{1,2})/),
    janela.match(/(\d{1,3}(?:[ .]\d{3})*,\d{2})\s*(?:€|eur)?/),
    janela.match(/(\d+,\d{2})\s*(?:€|eur)?/),
    janela.match(/(\d{1,3}(?:[ .]\d{3})+)(?:\s*(?:€|eur))/),
  ];
  for (const m of candidatos) {
    if (!m) continue;
    const v = num(m[1]);
    if (v != null && v > 0 && v < 100000) return v;
  }
  return null;
}

const PALAVRAS_VALOR = [
  "valor da fatura", "total a pagar", "valor a pagar", "valor total da fatura",
  "total da fatura", "valor da factura", "total da factura", "total do documento",
  "montante a pagar", "montante faturado", "total com creditos", "total apos iva",
  "total com iva", "valor total", "a pagar",
];

function acharValor(chao: string): { costEur: number | null; como: string } {
  for (const palavra of PALAVRAS_VALOR) {
    let i = chao.indexOf(palavra);
    while (i !== -1) {
      // primeiro o que vem depois da palavra; se nada, olha um pouco para trás
      // (algumas faturas põem o valor à esquerda do título)
      const depois = acharDinheiro(chao.slice(i, i + 110));
      if (depois != null) return { costEur: depois, como: palavra };
      const antes = acharDinheiro(chao.slice(Math.max(0, i - 34), i));
      if (antes != null) return { costEur: antes, como: palavra };
      i = chao.indexOf(palavra, i + 1);
    }
  }
  return { costEur: null, como: "" };
}

// ---- leituras do contador por período (vazio / ponta / cheias / ...) ----
const ROTULOS_LEITURA: [string, string][] = [
  ["Fora de Vazio", "fora de vazio"],
  ["Vazio", "vazio"],
  ["Ponta", "ponta"],
  ["Cheias", "cheias"],
  ["Normal", "normal"],
];

function acharLeituras(chao: string): InvoiceReading[] {
  const reRotulo = /(fora de vazio|vazio|ponta|cheias|normal)\s*:?\s*([\d\s.,]{1,14})/g;
  const porRotulo: Record<string, number[]> = {
    "fora de vazio": [], vazio: [], ponta: [], cheias: [], normal: [],
  };
  for (const m of chao.matchAll(reRotulo)) {
    const depois = chao.slice(m.index + m[0].length, m.index + m[0].length + 8);
    // não confundir leituras com consumos ("Vazio 180,5 kWh"), preços
    // ("Vazio 0,15 €/kWh"), potências ("10,35 kW") ou horas ("720 h")
    if (/^\s*(kwh|kw|kva|€|h\b|horas)/.test(depois)) continue;
    const val = num(m[2]);
    if (val != null) porRotulo[m[1]].push(val);
  }
  const leituras: InvoiceReading[] = [];
  for (const [rot, chave] of ROTULOS_LEITURA) {
    const vals = porRotulo[chave];
    if (vals.length >= 2) {
      leituras.push({ label: rot, previous: vals[0], current: vals[1] });
    } else if (vals.length === 1) {
      leituras.push({ label: rot, previous: null, current: vals[0] });
    }
  }
  if (leituras.length > 0) return leituras;

  // alguns formatos só dizem "Leitura anterior: 12345" / "Leitura atual: 12678"
  const reLeitura = /leituras?\s+(anterior|atual|actual|presente)[^:\n]{0,40}?:?\s*([\d\s.,]{1,14})/g;
  let anterior: number | null = null;
  let atual: number | null = null;
  for (const m of chao.matchAll(reLeitura)) {
    const val = num(m[2]);
    if (val == null) continue;
    if (/anterior/.test(m[1]) && anterior == null) anterior = val;
    if (!/anterior/.test(m[1]) && atual == null) atual = val;
  }
  if (anterior != null || atual != null) {
    return [{ label: "Contador", previous: anterior, current: atual }];
  }
  return [];
}

export function parseInvoiceText(bruto: string): ParsedInvoice {
  // texto em linhas para afrontar quebras; e uma versão "no chão" (minúsculas,
  // sem acentos) para os regexes — assim o PDF pode vir com acentos, sem
  // acentos ou com os acentos estragados, é igual
  const plano = bruto.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ");
  const chao = chaoDe(plano);
  const notes: string[] = [];
  const res: ParsedInvoice = {
    operatorName: null, issuedAt: null, periodStart: null, periodEnd: null,
    month: null, year: null, kwh: null, costEur: null, tariff: null,
    readings: [], readingsCheckOk: false, notes,
  };

  // ---- operador ----
  res.operatorName = detetarOperador(plano) ?? detetarOperador(chao);
  if (res.operatorName) notes.push(`Operador detetado: ${res.operatorName}.`);

  // ---- datas e período ----
  const datas = acharDatas(chao);
  const periodo = acharPeriodo(chao, datas);
  if (periodo.inicio && periodo.fim) {
    res.periodStart = dataISO(periodo.inicio.dia, periodo.inicio.mes, periodo.inicio.ano);
    res.periodEnd = dataISO(periodo.fim.dia, periodo.fim.mes, periodo.fim.ano);
    res.month = periodo.fim.mes;
    res.year = periodo.fim.ano;
    const fmt = (d: DataAchada) =>
      `${d.dia}/${String(d.mes).padStart(2, "0")}/${d.ano}`;
    notes.push(
      `Período de faturação (${periodo.como}): ${fmt(periodo.inicio)} a ${fmt(periodo.fim)}.`
    );
  }

  // ---- data de emissão ----
  const emissao = acharEmissao(chao, datas);
  if (emissao) {
    res.issuedAt = dataISO(emissao.dia, emissao.mes, emissao.ano);
    notes.push(`Fatura emitida em ${emissao.dia}/${String(emissao.mes).padStart(2, "0")}/${emissao.ano}.`);
    if (res.month == null) {
      // sem período, o mês da fatura é o da emissão — melhor do que nada
      res.month = emissao.mes;
      res.year = emissao.ano;
      notes.push("Mês estimado pela data de emissão (não encontrei o período de faturação).");
    }
  }

  // ---- consumo em kWh ----
  const consumo = acharConsumo(chao);
  res.kwh = consumo.kwh;
  if (res.kwh != null) {
    notes.push(`Consumo lido na fatura (${consumo.como}): ${Math.round(res.kwh)} kWh.`);
  }

  // ---- valor da fatura ----
  const valor = acharValor(chao);
  res.costEur = valor.costEur;
  if (res.costEur != null) {
    notes.push(`Valor da fatura: ${res.costEur.toFixed(2).replace(".", ",")} €.`);
  }

  // ---- tarifa ----
  const mTar = chao.match(
    /tarifa\s*:?\s*(tri-horaria|trihoraria|bi-horaria|bihoraria|simples|monoria|mon-horaria)/
  );
  if (mTar) {
    const bonito =
      mTar[1] === "tri-horaria" || mTar[1] === "trihoraria" ? "Tri-horária"
      : mTar[1] === "bi-horaria" || mTar[1] === "bihoraria" ? "Bi-horária"
      : mTar[1] === "monoria" || mTar[1] === "mon-horaria" ? "Monória"
      : "Simples";
    res.tariff = bonito;
    notes.push(`Tarifa: ${res.tariff}.`);
  }

  // ---- leituras do contador ----
  res.readings = acharLeituras(chao);
  let somaDif = 0;
  let temLeituras = false;
  for (const r of res.readings) {
    if (r.previous != null && r.current != null && r.current >= r.previous) {
      temLeituras = true;
      somaDif += r.current - r.previous;
    }
  }
  if (res.readings.length > 0) {
    notes.push(
      "Leituras do contador: " +
        res.readings
          .map((r) =>
            r.previous != null
              ? `${r.label} ${r.previous} → ${r.current}`
              : `${r.label} → ${r.current}`
          )
          .join("; ") + "."
    );
    if (res.kwh != null && temLeituras && Math.abs(somaDif - res.kwh) < 2) {
      res.readingsCheckOk = true;
      notes.push("As leituras batem certo com o consumo da fatura.");
    } else if (res.kwh == null && temLeituras && somaDif > 0) {
      // sem consumo escrito, o contador diz-nos quanto se gastou
      res.kwh = somaDif;
      res.readingsCheckOk = true;
      notes.push(`Consumo calculado pelas leituras do contador: ${Math.round(somaDif)} kWh.`);
    }
  }

  return res;
}
