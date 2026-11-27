// PDFs das faturas na nuvem (Vercel Blob).
//
// POST   /api/invoice  (multipart: ficheiro "file") → guarda o PDF e devolve
//        { url, pathname } — o url é público e estável, fica na fatura para
//        todos os aparelhos conseguirem abrir.
// DELETE /api/invoice?url=…  → apaga o PDF da nuvem (melhor-esforço).
import { NextRequest, NextResponse } from "next/server";
import { del, put } from "@vercel/blob";

export const dynamic = "force-dynamic";

const MAX = 15 * 1024 * 1024; // o mesmo limite que a app já impõe no navegador

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  const file = form.get("file");
  const pathname = String(form.get("pathname") ?? "");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Falta o ficheiro PDF" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(pathname)) {
    return NextResponse.json({ error: "Nome de ficheiro inválido" }, { status: 400 });
  }
  if (file.size > MAX) {
    return NextResponse.json({ error: "PDF demasiado grande" }, { status: 413 });
  }

  try {
    const blob = await put(`faturas/${pathname}.pdf`, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/pdf",
    });
    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch {
    return NextResponse.json({ error: "Não foi possível guardar o PDF" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !url.includes(".public.blob.vercel-storage.com")) {
    return NextResponse.json({ error: "URL inválido" }, { status: 400 });
  }
  try {
    await del(url);
  } catch {
    // se o PDF já não existe, tudo bem
  }
  return NextResponse.json({ ok: true });
}
