"use client";

import * as React from "react";
import {
  CheckCircle2, ExternalLink, FileText, Loader2, Pencil, Trash2, TriangleAlert, Upload,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fmtEur, fmtFileSize, fmtKwh, monthLabelLong, MESES,
} from "@/lib/appTypes";
import type { ExtractedInvoice, House, Invoice, Operator } from "@/lib/appTypes";
import type { ParsedInvoice } from "@/lib/invoice-parser";
import {
  deleteInvoice, getInvoicePdfUrl, parsePdfInvoice, saveInvoiceParsed,
  updateInvoice,
} from "@/lib/localdb";

// cores de marca conhecidas (para o badge do operador)
const MARCA: Record<string, string> = {
  "SU Eletricidade": "#005F9E", "EDP Comercial": "#E2001A", Galp: "#FF6600",
  Endesa: "#00995D", Iberdrola: "#78BE20", "Plenitude (Eni)": "#00694E",
  Goldenergy: "#3AAA35", "MEO Energia": "#E4002B", "Yes Energy": "#00A878",
  Repsol: "#ED1C24", Ytap: "#1B1B1B", "Octopus Energy": "#6F38C6",
};

export function InvoicesTab({
  houses,
  invoices,
  operators,
  onRefresh,
}: {
  houses: House[];
  invoices: Invoice[];
  operators: Operator[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [houseId, setHouseId] = React.useState(houses[0]?.id ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [fase, setFase] = React.useState<"texto" | "ocr">("texto");
  const [extracted, setExtracted] = React.useState<ExtractedInvoice | null>(null);
  const [deleting, setDeleting] = React.useState<Invoice | null>(null);

  // corrigir uma fatura que já está no arquivo (o lápis) — e tornar legível
  // uma fatura acabada de carregar que a app não tenha lido por inteiro
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editOrigem, setEditOrigem] = React.useState<"lapis" | "upload">("lapis");
  const [editInfo, setEditInfo] = React.useState<{
    casa: string; ficheiro: string; falta?: string;
  }>({ casa: "", ficheiro: "" });
  const [editNotas, setEditNotas] = React.useState<string[]>([]);
  const [editMes, setEditMes] = React.useState("1");
  const [editAno, setEditAno] = React.useState("2026");
  const [editKwh, setEditKwh] = React.useState("");
  const [editCusto, setEditCusto] = React.useState("");
  const [aGuardar, setAGuardar] = React.useState(false);
  const agora = new Date();
  const anosEdit = Array.from(
    { length: agora.getFullYear() + 1 - 2022 },
    (_, i) => 2022 + i
  );

  function preencherCampos(mes: number, ano: number, kwh: number | null, custo: number | null) {
    setEditMes(String(mes).padStart(2, "0"));
    setEditAno(String(ano));
    setEditKwh(kwh == null ? "" : String(kwh));
    setEditCusto(custo == null ? "" : String(custo).replace(".", ","));
  }

  // o lápis no cartão do arquivo
  function abrirEdicao(inv: Invoice) {
    setEditId(inv.id);
    setEditOrigem("lapis");
    setEditInfo({ casa: inv.houseName, ficheiro: inv.fileName });
    setEditNotas(inv.notes ?? []);
    preencherCampos(inv.month, inv.year, inv.kwh, inv.costEur);
  }

  // logo depois de carregar uma fatura que a app não leu por inteiro:
  // a janela abre-se sozinha, já com os palpites da app preenchidos
  function abrirLegibilizacao(
    extraido: ExtractedInvoice,
    casa: string,
    ficheiro: string
  ) {
    const falta =
      extraido.kwh == null && extraido.costEur == null
        ? "os valores"
        : extraido.kwh == null
          ? "o consumo"
          : "o valor";
    setEditId(extraido.invoiceId);
    setEditOrigem("upload");
    setEditInfo({ casa, ficheiro, falta });
    setEditNotas(extraido.notes ?? []);
    preencherCampos(extraido.month, extraido.year, extraido.kwh, extraido.costEur);
  }

  async function guardarEdicao() {
    if (!editId) return;
    setAGuardar(true);
    try {
      const kwhBruto = editKwh.trim() ? Number(editKwh.replace(",", ".")) : null;
      const custoBruto = editCusto.trim() ? Number(editCusto.replace(",", ".")) : null;
      if ((kwhBruto != null && Number.isNaN(kwhBruto)) || (custoBruto != null && Number.isNaN(custoBruto))) {
        throw new Error("O consumo e o valor têm de ser números (ex.: 400 ou 43,32).");
      }
      const invAntes = invoices.find((i) => i.id === editId);
      const antes =
        editOrigem === "lapis" && invAntes
          ? monthLabelLong(invAntes.year, invAntes.month)
          : null;
      await updateInvoice(editId, {
        year: Number(editAno),
        month: Number(editMes),
        kwh: kwhBruto,
        costEur: custoBruto,
      });
      const depois = monthLabelLong(Number(editAno), Number(editMes));
      if (editOrigem === "upload") {
        toast({
          title: "Fatura legível",
          description: `${depois} ficou preenchido no registo e a fatura completa no arquivo — nada de faturas ilegíveis.`,
        });
      } else {
        toast({
          title: antes === depois ? "Fatura corrigida" : "Fatura movida",
          description:
            antes === depois
              ? "Os valores do mês ficaram atualizados."
              : `Estava em ${antes} e agora está em ${depois} — o registo do mês mudou com ela.`,
        });
      }
      setEditId(null);
      onRefresh();
    } catch (e) {
      toast({
        title: "Não foi possível guardar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setAGuardar(false);
    }
  }

  React.useEffect(() => {
    if (!houseId && houses.length > 0) setHouseId(houses[0].id);
  }, [houses, houseId]);

  async function upload() {
    if (!file || !houseId) {
      toast({
        title: "Falta qualquer coisa",
        description: "Escolhe a casa e o PDF da fatura.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    setExtracted(null);
    setFase("texto");
    try {
      const resultado = await parsePdfInvoice(file, setFase);
      const p = resultado.parsed;
      const leuTudo =
        resultado.estado === "ok" &&
        p != null &&
        p.month != null &&
        p.year != null &&
        (p.kwh != null || p.costEur != null);

      // arquiva SEMPRE — mesmo que não tenha conseguido ler os valores.
      // Um PDF que o utilizador entregou nunca se atira fora: o mês
      // adivinha-se pelo nome do ficheiro (ou pela emissão, ou é o de hoje)
      // e o PDF fica no arquivo, visível em todos os aparelhos.
      const vazio: ParsedInvoice = {
        operatorName: null,
        issuedAt: null,
        periodStart: null,
        periodEnd: null,
        month: null,
        year: null,
        kwh: null,
        costEur: null,
        tariff: null,
        readings: [],
        readingsCheckOk: false,
        notes: p
          ? []
          : [resultado.motivo ?? "A app não conseguiu ler os valores deste PDF."],
      };
      const extraido = await saveInvoiceParsed(houseId, file, p ?? vazio);
      setExtracted(extraido);

      if (leuTudo) {
        toast({
          title: resultado.usouOcr
            ? "Fatura lida à mão (OCR) e arquivada"
            : "Fatura lida e arquivada",
          description: `${MESES[extraido.month - 1]} de ${extraido.year}: ${extraido.kwh ?? "?"} kWh por ${extraido.costEur ?? "?"} €. O registo do mês ficou preenchido.${resultado.usouOcr ? " A leitura foi de imagem — confere os valores." : ""}`,
        });
      } else {
        // nada de faturas ilegíveis: arquivou-se, e a janela abre-se logo
        // para os valores serem ditos e a fatura ficar completa
        const casaNome = houses.find((h) => h.id === houseId)?.name ?? "";
        abrirLegibilizacao(extraido, casaNome, file.name);
        if (p?.kwh != null || p?.costEur != null) {
          toast({
            title: "Fatura arquivada — li-a a meio",
            description:
              `${MESES[extraido.month - 1]} de ${extraido.year}` +
              (extraido.kwh != null ? `: ${fmtKwh(extraido.kwh)}` : "") +
              (extraido.costEur != null ? ` por ${fmtEur(extraido.costEur)}` : "") +
              ". Diz-me o que falta na janela que se abriu — assim fica completa.",
          });
        } else {
          toast({
            title: "Arquivada — agora torna-a legível",
            description:
              (resultado.motivo ??
                "Este PDF não me disse nada que eu percebesse (scansão? letra esquisita?).") +
              (extraido.mesEstimadoPor
                ? ` Mês estimado por ${extraido.mesEstimadoPor}: ${MESES[extraido.month - 1]} de ${extraido.year}.`
                : "") +
              " Preenche os valores na janela que se abriu e a fatura fica completa.",
          });
        }
      }
      setFile(null);
      onRefresh();
    } catch (e) {
      toast({
        title: "Não consegui arquivar a fatura",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteInvoice(deleting.id);
      toast({
        title: "Fatura apagada do arquivo",
        description: "Os valores que tinham sido preenchidos no mês ficam como estavam.",
      });
      setDeleting(null);
      onRefresh();
    } catch {
      toast({ title: "Não foi possível apagar", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const semCasas = houses.length === 0;
  // faturas no arquivo a que falta qualquer coisa — não podem ficar assim
  const nPorLegivel = invoices.filter(
    (i) => i.kwh == null || i.costEur == null
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* ---- carregar a fatura do mês ---- */}
      <Card>
        <CardContent className="grid gap-4 p-4 @min-[640px]:p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Upload className="h-4 w-4 text-muted-foreground" aria-hidden />
              Carregar a fatura do mês (PDF)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A app lê o PDF sozinha — tira o mês, o consumo, o valor a pagar e as
              leituras do contador — preenche o registo e guarda a fatura no
              arquivo. Se a fatura for um scancode ou fotografia, lê a imagem à
              mesma (OCR). E se ainda assim não conseguir ler os valores, o PDF
              fica arquivado à mesma e abre-se logo uma janela para a tornares
              legível — nenhuma fatura fica a meio.
            </p>
          </div>

          <div className="grid gap-4 @min-[640px]:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="fat-casa">Casa</Label>
              <Select value={houseId} onValueChange={setHouseId} disabled={semCasas}>
                <SelectTrigger id="fat-casa" className="h-11">
                  <SelectValue placeholder="Escolhe a casa" />
                </SelectTrigger>
                <SelectContent>
                  {houses.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: h.color }}
                        />
                        {h.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid content-start gap-2">
              <Label htmlFor="fat-file">Fatura (PDF)</Label>
              <label
                className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFile(f);
                }}
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">
                  {file ? file.name : "Escolhe o PDF ou arrasta-o para aqui"}
                </span>
                <input
                  id="fat-file"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={upload} disabled={busy || !file || !houseId} className="h-11">
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {fase === "ocr"
                    ? "A ler a fatura à mão (pode demorar um pouco)…"
                    : "A ler a fatura…"}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" aria-hidden />
                  Ler e arquivar
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Suporta faturas da SU Eletricidade, EDP, Galp, Endesa, Plenitude,
              Goldenergy, TotalEnergies, LUZON e outras — em texto ou em imagem.
            </p>
          </div>

          {/* o que a app leu sozinha */}
          {extracted && (
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="flex items-center gap-1.5 font-semibold">
                {extracted.kwh != null || extracted.costEur != null ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
                ) : (
                  <TriangleAlert className="h-4 w-4 text-amber-600" aria-hidden />
                )}
                {extracted.kwh != null || extracted.costEur != null
                  ? "O que a app preencheu sozinha:"
                  : "O que a app conseguiu ler:"}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>
                  Mês: <strong className="text-foreground">{monthLabelLong(extracted.year, extracted.month)}</strong>
                  {extracted.mesEstimadoPor && (
                    <span className="text-xs"> (estimado por {extracted.mesEstimadoPor})</span>
                  )}
                </li>
                {extracted.periodStart && extracted.periodEnd && (
                  <li>
                    Período de consumo: {""}
                    <strong className="text-foreground">
                      {new Date(extracted.periodStart).toLocaleDateString("pt-PT")} a{" "}
                      {new Date(extracted.periodEnd).toLocaleDateString("pt-PT")}
                    </strong>
                  </li>
                )}
                <li>
                  Consumo: <strong className="text-foreground">{fmtKwh(extracted.kwh)}</strong>
                  {" — "}Valor: <strong className="text-foreground">{fmtEur(extracted.costEur)}</strong>
                </li>
                {extracted.operatorName && (
                  <li>
                    Operador: <strong className="text-foreground">{extracted.operatorName}</strong>
                    {extracted.tariff ? ` — tarifa ${extracted.tariff}` : ""}
                  </li>
                )}
                {extracted.readings?.length > 0 && (
                  <li>
                    Leituras do contador:{" "}
                    <strong className="text-foreground">
                      {extracted.readings
                        .map((r) => `${r.label} ${r.previous} → ${r.current}`)
                        .join("; ")}
                    </strong>
                    {extracted.readingsCheckOk ? " (batem certo com o consumo)" : ""}
                  </li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- arquivo ---- */}
      <div>
        <h2 className="font-semibold">
          Arquivo de faturas
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {invoices.length > 0
              ? `${invoices.length} ${invoices.length === 1 ? "fatura guardada" : "faturas guardadas"}`
              : ""}
          </span>
          {nPorLegivel > 0 && (
            <span className="ml-2 text-sm font-normal text-amber-700 dark:text-amber-400">
              · {nPorLegivel} por tornar legível{nPorLegivel > 1 ? "es" : ""}
            </span>
          )}
        </h2>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Ainda não há faturas no arquivo. Carrega a primeira com o quadro
              acima — o PDF fica guardado aqui e podes abri-lo sempre que quiseres.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 @min-[640px]:grid-cols-2 @min-[1024px]:grid-cols-3">
          {invoices.map((inv) => {
            const corMarca =
              MARCA[inv.operatorName ?? ""] ??
              operators.find((o) => o.name === inv.operatorName)?.brandColor;
            const faltaAqui =
              inv.kwh == null && inv.costEur == null
                ? "Faltam o consumo e o valor"
                : inv.kwh == null
                  ? "Falta o consumo"
                  : inv.costEur == null
                    ? "Falta o valor"
                    : null;
            return (
              <Card key={inv.id} className="overflow-hidden">
                <div
                  aria-hidden
                  className="h-1.5 w-full"
                  style={{ backgroundColor: inv.houseColor }}
                />
                <CardContent className="grid gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight">
                        {monthLabelLong(inv.year, inv.month)}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          aria-hidden
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: inv.houseColor }}
                        />
                        {inv.houseName}
                        {inv.operatorName && corMarca && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
                            style={{ backgroundColor: corMarca }}
                          >
                            {inv.operatorName}
                          </span>
                        )}
                        {inv.operatorName && !corMarca && (
                          <span>· {inv.operatorName}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label={`Corrigir a fatura de ${monthLabelLong(inv.year, inv.month)}`}
                        title="Corrigir mês, consumo ou valor"
                        onClick={() => abrirEdicao(inv)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label={`Abrir o PDF de ${monthLabelLong(inv.year, inv.month)}`}
                        title="Abrir o PDF"
                        onClick={async () => {
                          const url = await getInvoicePdfUrl(inv.id);
                          if (url) {
                            window.open(url, "_blank", "noopener");
                          } else {
                            toast({
                              title: "PDF não disponível neste aparelho",
                              description:
                                "Esta fatura veio na cópia inicial sem o PDF. Volta a carregar o PDF em «Ler e arquivar» e fica guardado aqui para abrir sempre que quiseres.",
                            });
                          }
                        }}
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:text-destructive"
                        aria-label={`Apagar a fatura de ${monthLabelLong(inv.year, inv.month)}`}
                        onClick={() => setDeleting(inv)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Consumo</p>
                      <p className="font-semibold">{fmtKwh(inv.kwh)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Valor pago</p>
                      <p className="font-semibold">{fmtEur(inv.costEur)}</p>
                    </div>
                  </div>

                  {faltaAqui != null && (
                    <button
                      type="button"
                      onClick={() => abrirEdicao(inv)}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-amber-300/70 bg-amber-50/80 px-2.5 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                    >
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {faltaAqui} — tornar legível
                    </button>
                  )}

                  {inv.readings && inv.readings.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Leituras:{" "}
                      {inv.readings
                        .map((r) => `${r.label} ${r.previous} → ${r.current}`)
                        .join("; ")}
                    </p>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    {inv.fileName} · {fmtFileSize(inv.fileSize)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* confirmação de apagar fatura */}
      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apagar a fatura de {deleting ? monthLabelLong(deleting.year, deleting.month) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O PDF sai do arquivo, mas os valores que ficaram preenchidos nesse mês
              mantêm-se. Podes registá-los de novo quando quiseres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* corrigir ou tornar legível uma fatura: mês / consumo / valor */}
      <Dialog open={editId != null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent className="@min-[640px]:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editOrigem === "upload" ? "Torna esta fatura legível" : "Corrigir a fatura"}
            </DialogTitle>
            <DialogDescription>
              {editOrigem === "upload" ? (
                <>
                  {editInfo.casa} · {editInfo.ficheiro}. A app não leu{" "}
                  {editInfo.falta ?? "os valores"} deste PDF — diz-me aqui o mês,
                  o consumo e o valor. A fatura fica completa e o mês fica
                  preenchido no registo.
                </>
              ) : (
                <>
                  {editInfo.casa} · {editInfo.ficheiro}. Se o mês saiu mal da
                  leitura, diz-me aqui para que mês é esta fatura — o registo do
                  mês muda com ela.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {editNotas.length > 0 && (
            <p className="max-h-24 overflow-y-auto rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {editNotas.join(" ")}
            </p>
          )}
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-mes">Mês a que a fatura diz respeito</Label>
                <Select value={editMes} onValueChange={setEditMes}>
                  <SelectTrigger id="edit-mes" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>
                        {m[0].toUpperCase() + m.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-ano">Ano</Label>
                <Select value={editAno} onValueChange={setEditAno}>
                  <SelectTrigger id="edit-ano" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anosEdit.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-kwh">Consumo (kWh)</Label>
                <Input
                  id="edit-kwh"
                  inputMode="decimal"
                  placeholder="ex.: 400"
                  value={editKwh}
                  onChange={(e) => setEditKwh(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-custo">Valor pago (€)</Label>
                <Input
                  id="edit-custo"
                  inputMode="decimal"
                  placeholder="ex.: 43,32"
                  value={editCusto}
                  onChange={(e) => setEditCusto(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={guardarEdicao} disabled={aGuardar}>
              {aGuardar ? "A guardar…" : "Guardar correção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
