// A verdade partilhada da LuzIA: um documento JSON no Vercel Blob que todos
// os aparelhos leem e atualizam.
//
// Cada gravação cria um FICHEIRO NOVO (imutável) com o número de revisão no
// nome — nunca se grava por cima. O documento atual é o mais recente da lista.
// Isto evita os dois perigos de sobrescrever: caches que devolvem leituras
// velhas e escritas perdidas quando dois aparelhos gravam quase ao mesmo tempo.
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
import { del, list, put } from "@vercel/blob";

export const dynamic = "force-dynamic";
// desliga a cache de fetch do Next dentro desta rota: os pedidos ao armazém
// têm de ir sempre à rede
export const fetchCache = "force-no-store";

const PREFIXO = "estado/";
const PREFIXO_BACKUP = "backup/";
const VERSOES_KEPT = 3;
const BACKUPS_KEPT = 5;

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

// versões mais recentes primeiro
async function listar(caminho: string, limite: number) {
  const lst = await list({ prefix: caminho, limit: Math.max(20, limite) });
  return [...lst.blobs].sort(
    (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()
  );
}

// null = ainda não existe; falha = ARRELANHA (o PUT responde 503 e o cliente
// volta a tentar — nunca se grava por cima com um documento vazio)
async function lerDoc(): Promise<Doc | null> {
  const versoes = await listar(PREFIXO, VERSOES_KEPT);
  if (versoes.length === 0) return null;
  const res = await fetch(versoes[0].url + "?v=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("não consegui ler o documento central");
  const bruto = (await res.json()) as Partial<Doc>;
  const doc = docVazio();
  for (const t of TABELAS) {
    const m = bruto[t];
    if (m && typeof m === "object") doc[t] = m as Record<string, Registo>;
  }
  if (Array.isArray(bruto.deleted)) doc.deleted = bruto.deleted;
  doc.rev = typeof bruto.rev === "number" ? bruto.rev : 0;
  doc.atualizadoEm =
    typeof bruto.atualizadoEm === "string" ? bruto.atualizadoEm : "";
  return doc;
}

function pruneTumbos(doc: Doc) {
  const agora = Date.now();
  doc.deleted = doc.deleted.filter((d) => agora - Date.parse(d.at) < IDADE_TUMBO_MS);
}

// apaga as versões antigas (fica com as últimas `manter`)
async function podar(caminho: string, manter: number, exceto?: string) {
  try {
    const versoes = await listar(caminho, manter + 10);
    let n = 0;
    for (const v of versoes) {
      if (v.pathname === exceto) continue;
      n++;
      if (n > manter - (exceto ? 1 : 0)) {
        try {
          await del(v.url);
        } catch {
          // melhor-esforço
        }
      }
    }
  } catch {
    // melhor-esforço
  }
}

export async function GET() {
  let doc: Doc | null;
  try {
    doc = await lerDoc();
  } catch {
    return NextResponse.json(
      { error: "não consegui ler agora, tenta outra vez" },
      { status: 503 }
    );
  }
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

  let doc: Doc;
  try {
    doc = (await lerDoc()) ?? docVazio();
  } catch {
    // sem leitura fiável não se grava nada — o cliente volta a tentar
    return NextResponse.json(
      { error: "não consegui ler agora, tenta outra vez" },
      { status: 503 }
    );
  }
  const revAntes = doc.rev;
  const agora = new Date().toISOString();
  let mudou = false;

  // 1) apagados que chegaram agora
  for (const t of corpo.deleted ?? []) {
    const tabela = String(t.t ?? "");
    const id = String(t.id ?? "");
    if (!TABELAS.includes(tabela as Tabela) || !id) continue;
    if (!doc.deleted.some((d) => d.t === tabela && d.id === id)) {
      doc.deleted.push({ t: tabela, id, at: agora });
      delete doc[tabela as Tabela][id];
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
      // registos sem data de edição levam a data de agora (o servidor carimba)
      const reg: Registo = { ...r, updatedAt: String(r.updatedAt ?? "") || agora };
      const tombaAt = tumbosPorId.get(`${t}:${id}`);
      const novoAt = String(reg.updatedAt ?? "");
      if (tombaAt && (!novoAt || Date.parse(novoAt) <= Date.parse(tombaAt))) continue;
      const atual = doc[t][id];
      if (atual) {
        const atualAt = String(atual.updatedAt ?? "");
        if (novoAt && (!atualAt || novoAt > atualAt)) {
          doc[t][id] = reg;
          mudou = true;
        }
      } else {
        doc[t][id] = reg;
        mudou = true;
      }
    }
  }

  if (!mudou) {
    return NextResponse.json({ ok: true, rev: doc.rev, nadaNovo: true });
  }

  doc.rev = revAntes + 1;
  doc.atualizadoEm = agora;

  // 3) cópia de segurança diária antes de gravar (se já havia algo)
  if (revAntes > 0) {
    try {
      const nomeBak = `${PREFIXO_BACKUP}estado-${agora.slice(0, 10)}-r${revAntes}-${Date.now()}.json`;
      await put(nomeBak, JSON.stringify({ ...doc, rev: revAntes }), {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json",
      });
      await podar(PREFIXO_BACKUP, BACKUPS_KEPT);
    } catch {
      // a cópia de segurança é melhor-esforço; nunca bloqueia a gravação
    }
  }

  // 4) grava como ficheiro NOVO (imutável) — nunca por cima
  const nomeNovo = `${PREFIXO}luzia-estado-r${doc.rev}-${Date.now()}.json`;
  await put(nomeNovo, JSON.stringify(doc), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });

  // 5) limpa versões antigas (fica com as últimas)
  await podar(PREFIXO, VERSOES_KEPT, nomeNovo);

  return NextResponse.json({ ok: true, rev: doc.rev, atualizadoEm: agora });
}
