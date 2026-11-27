"use client";

import * as React from "react";
import { Download, FileJson, Home, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { House } from "@/lib/appTypes";
import { deleteHouse, exportData, importData, saveHouse } from "@/lib/localdb";

const CORES_PADRAO = [
  "#F97316", "#EF4444", "#22C55E", "#0EA5E9", "#A855F7", "#14B8A6",
  "#EC4899", "#EAB308", "#64748B", "#1B6F4A",
];

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; house: House }
  | null;

export function HousesTab({
  houses,
  onRefresh,
}: {
  houses: House[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [deleting, setDeleting] = React.useState<House | null>(null);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#F97316");
  const [busy, setBusy] = React.useState(false);
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [importBusy, setImportBusy] = React.useState(false);
  const [copiaBusy, setCopiaBusy] = React.useState(false);

  function openCreate() {
    setName("");
    setColor(CORES_PADRAO[(houses.length) % CORES_PADRAO.length]);
    setDialog({ kind: "create" });
  }

  function openEdit(h: House) {
    setName(h.name);
    setColor(h.color);
    setDialog({ kind: "edit", house: h });
  }

  async function save() {
    if (!dialog) return;
    if (!name.trim()) {
      toast({ title: "Dá um nome à casa", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const isEdit = dialog.kind === "edit";
      await saveHouse({ name: name.trim(), color }, isEdit ? dialog.house.id : undefined);
      toast({
        title: isEdit ? "Casa atualizada" : "Casa adicionada",
        description: `${name.trim()} ${isEdit ? "ficou com os dados atualizados." : "já pode começar a registar consumos."}`,
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
      await deleteHouse(deleting.id);
      toast({ title: "Casa apagada", description: `${deleting.name} e os seus registos foram removidos.` });
      setDeleting(null);
      onRefresh();
    } catch {
      toast({ title: "Não foi possível apagar", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  // traz os dados de um ficheiro exportado por esta app (ex.: em outro sítio)
  async function importarDados() {
    if (!importFile) return;
    setImportBusy(true);
    try {
      const texto = await importFile.text();
      const corpo = JSON.parse(texto); // se não for JSON, avisa abaixo
      const res = await importData(corpo);
      toast({
        title: "Dados trazidos!",
        description: `Casas: ${res.casas.total} · Registos: ${res.registos.criados} novos e ${res.registos.atualizados} atualizados · Operadores: ${res.operadores}.`,
      });
      setImportFile(null);
      onRefresh();
    } catch (e) {
      toast({
        title: "Importação falhou",
        description: e instanceof SyntaxError ? "O ficheiro não parece um export desta app (JSON inválido)." : e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setImportBusy(false);
    }
  }

  // guarda uma cópia de segurança num ficheiro (para outro telemóvel/computador)
  async function guardarCopia() {
    setCopiaBusy(true);
    try {
      const texto = await exportData();
      const blob = new Blob([texto], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dados-luz-em-casa.json";
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Cópia guardada",
        description: "Fica nas transferências do aparelho (dados-luz-em-casa.json), com as faturas arquivadas incluídas.",
      });
    } catch {
      toast({ title: "Não foi possível guardar a cópia", variant: "destructive" });
    } finally {
      setCopiaBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Cada casa tem a sua cor nos gráficos. Podes juntar outras casas a qualquer altura.
        </p>
        <Button onClick={openCreate} className="h-11">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Nova casa
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 @min-[640px]:grid-cols-2 @min-[1024px]:grid-cols-3">
        {houses.map((h) => (
          <Card key={h.id} className="overflow-hidden">
            <div aria-hidden className="h-1.5 w-full" style={{ backgroundColor: h.color }} />
            <CardContent className="flex items-center justify-between gap-2 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  <Home className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{h.name}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {h.readingsCount ?? 0} registos de consumo
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label={`Editar ${h.name}`}
                  onClick={() => openEdit(h)}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive hover:text-destructive"
                  aria-label={`Apagar ${h.name}`}
                  onClick={() => setDeleting(h)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ---- guardar e trazer os dados (cópia de segurança) ---- */}
      <Card>
        <CardContent className="grid gap-4 p-4 @min-[640px]:p-5">
          <div>
            <h2 className="font-semibold">Os teus dados vivem neste aparelho</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tudo o que registas fica guardado aqui dentro — nada de contas nem de
              nuvem. Se mudares de telemóvel, guarda uma cópia num ficheiro e traz-na
              de volta no novo aparelho.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={guardarCopia} disabled={copiaBusy} className="h-11">
              {copiaBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  A guardar…
                </>
              ) : (
                <>
                  <Download className="mr-1.5 h-4 w-4" aria-hidden />
                  Guardar cópia (.json)
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 @min-[640px]:p-5">
          <div>
            <h2 className="font-semibold">Trazer os teus dados</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Se tens um ficheiro de dados desta app (por exemplo, o
              «dados-luz-em-casa.json» que saiu do teu computador), arrasta-o
              aqui: as casas, os consumos e as ofertas voltam todos — nada se
              duplica.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label
              className="flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted-foreground transition-colors hover:bg-accent @min-[640px]:max-w-sm"
            >
              <FileJson className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">
                {importFile ? importFile.name : "Escolhe o ficheiro .json ou arrasta-o"}
              </span>
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button
              onClick={importarDados}
              disabled={importBusy || !importFile}
              className="h-11"
            >
              {importBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  A trazer…
                </>
              ) : (
                "Importar"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* diálogo criar/editar casa */}
      <Dialog open={dialog != null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="@min-[640px]:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog?.kind === "edit" ? "Editar casa" : "Nova casa"}</DialogTitle>
            <DialogDescription>
              {dialog?.kind === "edit"
                ? "Muda o nome ou a cor da casa."
                : "Dá um nome à casa (ex.: «Casa dos avós») e escolhe uma cor."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="house-name">Nome da casa</Label>
              <Input
                id="house-name"
                placeholder="ex.: Casa da praia"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label>Cor nos gráficos</Label>
              <div className="flex flex-wrap items-center gap-2">
                {CORES_PADRAO.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Cor ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={`h-10 w-10 rounded-md border-2 transition-transform hover:scale-105 ${
                      color === c ? "border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <span className="mx-1 hidden h-6 w-px bg-border @min-[640px]:block" aria-hidden />
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground hover:bg-accent">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                    aria-label="Escolher outra cor"
                  />
                  outra cor
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button onClick={save} disabled={busy}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* confirmação de apagar casa */}
      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar «{deleting?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Apagam-se também os {deleting?.readingsCount ?? 0} registos dessa
              casa. Esta ação não pode ser desfeita.
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
