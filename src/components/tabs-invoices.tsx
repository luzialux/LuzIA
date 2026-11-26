"use client";

import * as React from "react";
import {
  CheckCircle2, ExternalLink, FileText, Loader2, Trash2, Upload,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { deleteInvoice, getInvoicePdfUrl, saveInvoiceFromPdf } from "@/lib/localdb";

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
  const [extracted, setExtracted] = React.useState<ExtractedInvoice | null>(null);
  const [deleting, setDeleting] = React.useState<Invoice | null>(null);

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
    try {
      const extraido = await saveInvoiceFromPdf(houseId, file);
      setExtracted(extraido);
      toast({
        title: "Fatura lida e arquivada",
        description: `${MESES[extraido.month - 1]} de ${extraido.year}: ${extraido.kwh ?? "?"} kWh por ${extraido.costEur ?? "?"} €. O registo do mês ficou preenchido.`,
      });
      setFile(null);
      onRefresh();
    } catch (e) {
      toast({
        title: "Não consegui ler a fatura",
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

  return (
    <div className="flex flex-col gap-4">
      {/* ---- carregar a fatura do mês ---- */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Upload className="h-4 w-4 text-muted-foreground" aria-hidden />
              Carregar a fatura do mês (PDF)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A app lê o PDF sozinha — tira o mês, o consumo, o valor a pagar e as
              leituras do contador — preenche o registo e guarda a fatura no arquivo.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
                  A ler a fatura…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" aria-hidden />
                  Ler e arquivar
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Suporta faturas da SU Eletricidade, EDP, Galp, Endesa, Iberdrola,
              Plenitude, Goldenergy e outros.
            </p>
          </div>

          {/* o que a app leu sozinha */}
          {extracted && (
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
                O que a app preencheu sozinha:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>
                  Mês: <strong className="text-foreground">{monthLabelLong(extracted.year, extracted.month)}</strong>
                </li>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {invoices.map((inv) => {
            const corMarca =
              MARCA[inv.operatorName ?? ""] ??
              operators.find((o) => o.name === inv.operatorName)?.brandColor;
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
    </div>
  );
}
