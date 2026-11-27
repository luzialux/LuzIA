// A verdade partilhada da LuzIA: um único documento JSON no Vercel Blob
// que todos os aparelhos leem e atualizam.
//
// GET  /api/data  → devolve o documento central (ou null se ainda não existir)
// PUT  /api/data  → junta os registos que chegam ao documento central
//                   (por id; ganha quem tiver o updatedAt mais recente)
//
// O documento tem esta forma:
// {
//   houses:    { "<id>": registo },
//   readings:  { "<id>": registo },
//   operators: { "<id>": registo },
//   invoices:  { "<id>": registo },
//   deleted:   [ { t: "readings", id: "...", at: "ISO" } ],  // apagados
//   rev: 12, atualizadoEm: "ISO"
// }
import { NextRequest, NextResponse } from "next/server";
import { head, put } from "@vercel/blob";

export const dynamic = "force-dynamic";

const CAMINHO = "estado/luzia-estado.json";

type Registo = Record<string, unknown> & { id?: string; updatedAt?: string };

type Doc = {
  houses: Record<string, Registo>;
  readings: Record<string, Registo>;
  operators: Record<string, Registo>;
  invoices: Record<string, Registo>;
  deleted: { t: string; id: string; at: string }[];
  rev: number;
  atualizadoEm: string;
};

const TABELAS = ["houses", "readings", "operators", "invoices"] as const;
type Tabela = (typeof TABELAS)[number];

const LIMITES: Record<Tabela, number> = {
  houses: 100,
  readings: 20000,
  operators: 500,
  invoices: 2000,
};

// apagados com mais de 90 dias saem da lista (ids novos nunca colidem)
const IDADE_TUMBO_MS = 90 * 24 * 60 * 60 * 1000;

function docVazio(): Doc {
  return {
    houses: {},
    readings: {},
    operators: {},
    invoices: {},
    deleted: [],
    rev: 0,
    atualizadoEm: new Date().toISOString(),
  };
}

async function lerDoc(): Promise<Doc | null> {
  try {
    const meta = await head(CAMINHO);
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) return null;
    const bruto = (await res.json()) as Partial<Doc>;
    const doc = docVazio();
    for (const t of TABELAS) {
      const m = bruto[t];
      if (m && typeof m === "object") doc[t] = m as Record<string, Registo>;
    }
    if (Array.isArray(bruto.deleted)) doc.deleted = bruto.deleted;
    doc.rev = typeof bruto.rev === "number" ? bruto.rev : 0;
    return doc;
  } catch {
    return null;
  }
}

function pruneTumbos(doc: Doc) {
  const agora = Date.now();
  doc.deleted = doc.deleted.filter((d) => agora - Date.parse(d.at) < IDADE_TUMBO_MS);
}

export async function GET() {
  const doc = await lerDoc();
  if (!doc) return NextResponse.json(null, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(doc, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  let corpo: {
    houses?: Registo[];
    readings?: Registo[];
    operators?: Registo[];
    invoices?: Registo[];
    deleted?: { t?: string; id?: string }[];
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const doc = (await lerDoc()) ?? docVazio();
  const antes = doc.rev;
  const agora = new Date().toISOString();
  let mudou = false;

  // 1) apagados que chegaram agora
  for (const t of corpo.deleted ?? []) {
    const tabela = String(t.t ?? "");
    const id = String(t.id ?? "");
    if (!TABELAS.includes(tabela as Tabela) || !id) continue;
    if (!doc.deleted.some((d) => d.t === tabela && d.id === id)) {
      doc.deleted.push({ t: tabela, id, at: agora });
      mudou = true;
    }
  }
  pruneTumbos(doc);

  const tumbosPorId = new Map<string, string>();
  for (const d of doc.deleted) tumbosPorId.set(`${d.t}:${d.id}`, d.at);

  // 2) registos que chegaram — um a um, ganha o updatedAt mais recente
  for (const t of TABELAS) {
    const chegaram = corpo[t];
    if (!Array.isArray(chegaram)) continue;
    if (Object.keys(doc[t]).length + chegaram.length > LIMITES[t]) {
      return NextResponse.json({ error: `Demasiados registos em ${t}` }, { status: 400 });
    }
    for (const r of chegaram) {
      const id = String(r.id ?? "");
      if (!id) continue;
      const chave = `${t}:${id}`;
      const tombaAt = tumbosPorId.get(chave);
      const novoAt = String(r.updatedAt ?? "");
      if (tombaAt && (!novoAt || Date.parse(novoAt) <= Date.parse(tombaAt))) continue;
      const atual = doc[t][id];
      if (atual) {
        const atualAt = String(atual.updatedAt ?? "");
        if (novoAt && (!atualAt || novoAt > atualAt)) {
          doc[t][id] = r;
          mudou = true;
        }
      } else {
        doc[t][id] = r;
        mudou = true;
      }
    }
  }

  if (!mudou) {
    return NextResponse.json({ ok: true, rev: doc.rev, nadaNovo: true });
  }

  doc.rev = antes + 1;
  doc.atualizadoEm = agora;

  // 3) cópia de segurança diária antes de gravar por cima (se já havia algo)
  if (antes > 0) {
    const hoje = agora.slice(0, 10);
    try {
      const bakPath = `backup/estado-${hoje}.json`;
      try {
        await head(bakPath);
      } catch {
        await put(bakPath, JSON.stringify({ ...doc, rev: antes }), {
          access: "public",
          addRandomSuffix: false,
          contentType: "application/json",
        });
      }
    } catch {
      // a cópia de segurança é melhor-esforço; nunca bloqueia a gravação
    }
  }

  await put(CAMINHO, JSON.stringify(doc), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });

  return NextResponse.json({ ok: true, rev: doc.rev, atualizadoEm: agora });
}
