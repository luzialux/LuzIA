"use client";

import * as React from "react";
import { Euro, ExternalLink, Pencil, Plus, Trash2, Zap, BadgeCheck } from "lucide-react";
import { useTheme } from "next-themes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { mix, fmtEur } from "@/lib/appTypes";
import type { Operator } from "@/lib/appTypes";
import { deleteOperator, saveOperator } from "@/lib/localdb";

type Form = {
  name: string;
  brandColor: string;
  website: string;
  isNewPlayer: boolean;
  offerTitle: string;
  offerSummary: string;
  bonusEur: string;
  priceKwh: string;
  conditions: string;
  sourceUrl: string;
};

const EMPTY_FORM: Form = {
  name: "",
  brandColor: "#00A878",
  website: "",
  isNewPlayer: true,
  offerTitle: "",
  offerSummary: "",
  bonusEur: "",
  priceKwh: "",
  conditions: "",
  sourceUrl: "",
};

export function PlayersTab({
  operators,
  onRefresh,
}: {
  operators: Operator[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  const [filter, setFilter] = React.useState("new");
  const [dialog, setDialog] = React.useState<{ kind: "create" } | { kind: "edit"; op: Operator } | null>(null);
  const [form, setForm] = React.useState<Form>(EMPTY_FORM);
  const [deleting, setDeleting] = React.useState<Operator | null>(null);
  const [busy, setBusy] = React.useState(false);

  const visible = React.useMemo(() => {
    const list = operators.filter((op) => filter === "all" || op.isNewPlayer);
    return [...list].sort(
      (a, b) => (b.bonusEur ?? -1) - (a.bonusEur ?? -1) || a.sortOrder - b.sortOrder
    );
  }, [operators, filter]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialog({ kind: "create" });
  }

  function openEdit(op: Operator) {
    setForm({
      name: op.name,
      brandColor: op.brandColor,
      website: op.website,
      isNewPlayer: op.isNewPlayer,
      offerTitle: op.offerTitle ?? "",
      offerSummary: op.offerSummary ?? "",
      bonusEur: op.bonusEur != null ? String(op.bonusEur).replace(".", ",") : "",
      priceKwh: op.priceKwh ?? "",
      conditions: op.conditions ?? "",
      sourceUrl: op.sourceUrl ?? "",
    });
    setDialog({ kind: "edit", op });
  }

  async function save() {
    if (!dialog) return;
    if (!form.name.trim() || !form.website.trim()) {
      toast({
        title: "Faltam dados",
        description: "Preenche pelo menos o nome e o site do operador.",
        variant: "destructive",
      });
      return;
    }
    if (!/^https?:\/\/.+/.test(form.website.trim())) {
      toast({ title: "O site tem de começar por https://", variant: "destructive" });
      return;
    }
    if (form.bonusEur.trim() !== "" && Number.isNaN(Number(form.bonusEur.replace(",", ".")))) {
      toast({ title: "Bónus inválido", description: "Escreve só o número, ex.: 120", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const isEdit = dialog.kind === "edit";
      await saveOperator(
        {
          name: form.name.trim(),
          brandColor: form.brandColor,
          website: form.website.trim(),
          isNewPlayer: form.isNewPlayer,
          offerTitle: form.offerTitle.trim() || null,
          offerSummary: form.offerSummary.trim() || null,
          bonusEur:
            form.bonusEur.trim() === ""
              ? null
              : Number(form.bonusEur.replace(",", ".")),
          priceKwh: form.priceKwh.trim() || null,
          conditions: form.conditions.trim() || null,
          sourceUrl: form.sourceUrl.trim() || null,
        },
        isEdit ? dialog.op.id : undefined
      );
      toast({
        title: isEdit ? "Oferta atualizada" : "Operador adicionado",
        description: `${form.name.trim()} ${isEdit ? "ficou com os dados em dia." : "juntou-se ao comparador."}`,
      });
      setDialog(null);
      onRefresh();
    } catch (e) {
      toast({
        title: "Não foi possível guardar",
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
      await deleteOperator(deleting.id);
      toast({ title: "Operador removido", description: `${deleting.name} saiu do comparador.` });
      setDeleting(null);
      onRefresh();
    } catch {
      toast({ title: "Não foi possível apagar", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Ofertas para <strong className="text-foreground">novos clientes</strong> —
          bónus de adesão e preços. Ordenadas do maior bónus para o menor. Podes
          corrigir qualquer valor ou acrescentar um operador novo.
        </p>
        <div className="flex flex-wrap gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-10 w-[180px]" aria-label="Filtrar operadores">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Só novos players</SelectItem>
              <SelectItem value="all">Todos os operadores</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="h-10">
            <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Novo operador
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {visible.map((op) => {
          const display = dark ? mix(op.brandColor, 0.35) : op.brandColor;
          return (
            <Card key={op.id} className="overflow-hidden">
              <div aria-hidden className="h-1.5 w-full" style={{ backgroundColor: op.brandColor }} />
              <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={op.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-bold leading-tight underline-offset-4 hover:underline"
                    style={{ color: display }}
                    aria-label={`Site oficial da ${op.name} (abre em nova janela)`}
                  >
                    {op.name}
                  </a>
                  <div className="flex items-center gap-2">
                    {op.isNewPlayer && (
                      <Badge variant="secondary" className="gap-1">
                        <BadgeCheck className="h-3 w-3" aria-hidden /> novo player
                      </Badge>
                    )}
                    {op.bonusEur != null && (
                      <Badge className="gap-1 bg-amber-500 text-black hover:bg-amber-500">
                        <Euro className="h-3 w-3" aria-hidden />
                        bónus {fmtEur(op.bonusEur)}
                      </Badge>
                    )}
                  </div>
                </div>

                {op.offerTitle && (
                  <p className="font-medium leading-snug">{op.offerTitle}</p>
                )}
                {op.offerSummary && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {op.offerSummary}
                  </p>
                )}

                <div className="mt-auto flex flex-col gap-2 text-sm">
                  {op.priceKwh && (
                    <p className="flex items-center gap-2">
                      <Zap className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                      <span className="tabular-nums">{op.priceKwh}</span>
                    </p>
                  )}
                  {op.conditions && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Condições:</span>{" "}
                      {op.conditions}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {op.sourceUrl ? (
                      <a
                        href={op.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        aria-label={`Ver a fonte da oferta de ${op.name} (abre em nova janela)`}
                      >
                        Ver fonte <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : (
                      <span />
                    )}
                    <span className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label={`Editar ${op.name}`}
                        onClick={() => openEdit(op)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:text-destructive"
                        aria-label={`Remover ${op.name}`}
                        onClick={() => setDeleting(op)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Ofertas verificadas em 26/11/2026. As empresas mudam as campanhas a
        qualquer momento — confirma sempre no site oficial antes de contratar.
      </p>

      {/* diálogo criar/editar operador */}
      <Dialog open={dialog != null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "edit" ? "Editar oferta" : "Novo operador"}
            </DialogTitle>
            <DialogDescription>
              Preenche o que souberes — só o nome e o site são obrigatórios.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="op-name">Nome do operador *</Label>
                <Input
                  id="op-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-11"
                  placeholder="ex.: Yes Energy"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="op-color">Cor da marca</Label>
                <div className="flex h-11 items-center gap-2 rounded-md border px-3">
                  <input
                    id="op-color"
                    type="color"
                    value={form.brandColor}
                    onChange={(e) => setForm({ ...form, brandColor: e.target.value })}
                    className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                    aria-label="Cor da marca do operador"
                  />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {form.brandColor}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="op-site">Site oficial (https://…) *</Label>
              <Input
                id="op-site"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="h-11"
                placeholder="https://…"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-3">
              <Label htmlFor="op-new" className="cursor-pointer">
                É um novo player?
              </Label>
              <Switch
                id="op-new"
                checked={form.isNewPlayer}
                onCheckedChange={(v) => setForm({ ...form, isNewPlayer: v })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="op-title">Título da oferta</Label>
              <Input
                id="op-title"
                value={form.offerTitle}
                onChange={(e) => setForm({ ...form, offerTitle: e.target.value })}
                className="h-11"
                placeholder="ex.: Bónus de 120 € em fatura"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="op-summary">Descrição da oferta</Label>
              <Textarea
                id="op-summary"
                value={form.offerSummary}
                onChange={(e) => setForm({ ...form, offerSummary: e.target.value })}
                rows={3}
                placeholder="Para novos clientes, o que inclui…"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="op-bonus">Bónus (€)</Label>
                <Input
                  id="op-bonus"
                  inputMode="decimal"
                  value={form.bonusEur}
                  onChange={(e) => setForm({ ...form, bonusEur: e.target.value })}
                  className="h-11"
                  placeholder="ex.: 120"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="op-price">Preço (texto livre)</Label>
                <Input
                  id="op-price"
                  value={form.priceKwh}
                  onChange={(e) => setForm({ ...form, priceKwh: e.target.value })}
                  className="h-11"
                  placeholder="ex.: 0,1599 €/kWh"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="op-conditions">Condições</Label>
              <Input
                id="op-conditions"
                value={form.conditions}
                onChange={(e) => setForm({ ...form, conditions: e.target.value })}
                className="h-11"
                placeholder="ex.: débito direto e fatura eletrónica"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="op-source">Link da fonte (https://…)</Label>
              <Input
                id="op-source"
                value={form.sourceUrl}
                onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                className="h-11"
                placeholder="https://…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button onClick={save} disabled={busy}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* confirmação de apagar operador */}
      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover «{deleting?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              O operador sai do comparador. Podes voltar a adicioná-lo mais tarde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
