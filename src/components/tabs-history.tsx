"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  fmtKwh, fmtEur, fmtCounter, monthKey, monthLabelLong,
} from "@/lib/appTypes";
import type { House, Reading } from "@/lib/appTypes";
import { deleteReading, updateReading } from "@/lib/localdb";

export function HistoryTab({
  houses,
  readings,
  onRefresh,
}: {
  houses: House[];
  readings: Reading[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [houseFilter, setHouseFilter] = React.useState("all");
  const [editing, setEditing] = React.useState<Reading | null>(null);
  const [deleting, setDeleting] = React.useState<Reading | null>(null);
  const [editKwh, setEditKwh] = React.useState("");
  const [editCost, setEditCost] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const filtered = React.useMemo(() => {
    return readings
      .filter((r) => houseFilter === "all" || r.houseId === houseFilter)
      .sort(
        (a, b) =>
          monthKey(b.year, b.month) - monthKey(a.year, a.month) ||
          a.houseName.localeCompare(b.houseName)
      );
  }, [readings, houseFilter]);

  const years = [...new Set(readings.map((r) => r.year))].sort((a, b) => b - a);

  function openEdit(r: Reading) {
    setEditing(r);
    setEditKwh(r.kwh != null ? String(r.kwh).replace(".", ",") : "");
    setEditCost(r.costEur != null ? String(r.costEur).replace(".", ",") : "");
  }

  async function saveEdit() {
    if (!editing) return;
    const k = editKwh.trim() === "" ? null : Number(editKwh.replace(",", "."));
    const c = editCost.trim() === "" ? null : Number(editCost.replace(",", "."));
    if (k == null && c == null) {
      toast({ title: "Escreve pelo menos um valor", variant: "destructive" });
      return;
    }
    if ((k != null && Number.isNaN(k)) || (c != null && Number.isNaN(c))) {
      toast({ title: "Valor inválido", description: "Usa só números.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await updateReading(editing.id, k, c);
      toast({ title: "Registo corrigido", description: `${monthLabelLong(editing.year, editing.month)} — ${editing.houseName}.` });
      setEditing(null);
      onRefresh();
    } catch {
      toast({ title: "Não foi possível guardar", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteReading(deleting.id);
      toast({ title: "Registo apagado" });
      setDeleting(null);
      onRefresh();
    } catch {
      toast({ title: "Não foi possível apagar", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base sm:text-lg">
          Registos <span className="text-muted-foreground">({filtered.length})</span>
        </CardTitle>
        <Select value={houseFilter} onValueChange={setHouseFilter}>
          <SelectTrigger className="h-10 w-[170px]" aria-label="Filtrar por casa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as casas</SelectItem>
            {houses.map((h) => (
              <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Ainda não há registos{years.length ? "" : " — começa no separador «Registar»"}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-0">Mês</TableHead>
                  <TableHead>Casa</TableHead>
                  <TableHead className="text-right">Consumo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Contador</TableHead>
                  <TableHead className="w-24 pr-4 sm:pr-0">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap pl-4 font-medium sm:pl-0">
                      {monthLabelLong(r.year, r.month)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span
                          aria-hidden
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: r.houseColor }}
                        />
                        {r.houseName}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtKwh(r.kwh)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEur(r.costEur)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                      {fmtCounter(r.counterValue)}
                    </TableCell>
                    <TableCell className="pr-4 sm:pr-0">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          aria-label={`Corrigir registo de ${monthLabelLong(r.year, r.month)}`}
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive"
                          aria-label={`Apagar registo de ${monthLabelLong(r.year, r.month)}`}
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* diálogo de edição */}
      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corrigir registo</DialogTitle>
            <DialogDescription>
              {editing && `${monthLabelLong(editing.year, editing.month)} — ${editing.houseName}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-kwh">Consumo (kWh)</Label>
              <Input
                id="edit-kwh"
                inputMode="decimal"
                value={editKwh}
                onChange={(e) => setEditKwh(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-cost">Valor pago (€)</Label>
              <Input
                id="edit-cost"
                inputMode="decimal"
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={busy}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* confirmação de apagar */}
      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar este registo?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting &&
                `${monthLabelLong(deleting.year, deleting.month)} — ${deleting.houseName} (${fmtKwh(deleting.kwh)})`}
              . Esta ação não pode ser desfeita.
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
    </Card>
  );
}
