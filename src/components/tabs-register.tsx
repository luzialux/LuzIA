"use client";

import * as React from "react";
import { Gauge, FileText, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MESES, monthKey } from "@/lib/appTypes";
import type { House, Reading } from "@/lib/appTypes";
import { saveReadingBill, saveReadingCounter } from "@/lib/localdb";

const CORES_PADRAO = [
  "#F97316", "#EF4444", "#22C55E", "#0EA5E9", "#A855F7", "#14B8A6",
];

export function RegisterTab({
  houses,
  readings,
  onSaved,
}: {
  houses: House[];
  readings: Reading[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [houseId, setHouseId] = React.useState<string>(houses[0]?.id ?? "");
  const [saving, setSaving] = React.useState(false);

  // modo leitura do contador
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = React.useState(today);
  const [counterValue, setCounterValue] = React.useState("");
  const [counterCost, setCounterCost] = React.useState("");

  // modo fatura do mês
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear().toString());
  const [month, setMonth] = React.useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [kwh, setKwh] = React.useState("");
  const [cost, setCost] = React.useState("");

  const years = Array.from(
    { length: now.getFullYear() + 1 - 2022 },
    (_, i) => 2022 + i
  );

  const selectedHouse = houses.find((h) => h.id === houseId);

  // última leitura do contador da casa escolhida (para orientar o utilizador)
  const lastCounter = React.useMemo(() => {
    const mine = readings
      .filter((r) => r.houseId === houseId && r.counterValue != null)
      .sort((a, b) => monthKey(b.year, b.month) - monthKey(a.year, a.month));
    return mine[0] ?? null;
  }, [readings, houseId]);

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res =
        body.mode === "counter"
          ? await saveReadingCounter(
              houseId,
              String(body.date ?? date),
              Number(body.counterValue),
              (body.costEur as number | null) ?? null
            )
          : await saveReadingBill(
              houseId,
              Number(body.year),
              Number(body.month),
              (body.kwh as number | null) ?? null,
              (body.costEur as number | null) ?? null
            );
      if (res.mode === "counter") {
        if (res.isBaseline) {
          toast({
            title: "Primeira leitura guardada",
            description:
              "Serve de ponto de partida. Na próxima leitura, o consumo é calculado automaticamente pela diferença do contador.",
          });
        } else {
          toast({
            title: "Leitura guardada",
            description: `Consumo calculado: ${res.kwh} kWh desde a última leitura.`,
          });
        }
      } else {
        toast({ title: "Fatura registada", description: "O registo do mês ficou guardado." });
      }
      setCounterValue("");
      setCounterCost("");
      setKwh("");
      setCost("");
      onSaved();
    } catch (e) {
      toast({
        title: "Não foi possível guardar",
        description: e instanceof Error ? e.message : "Tenta outra vez dentro de instantes.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function submitCounter() {
    const value = Number(counterValue.replace(",", "."));
    if (!counterValue || Number.isNaN(value)) {
      toast({ title: "Falta o valor do contador", description: "Lê o número no mostrador do contador e escreve-o aqui.", variant: "destructive" });
      return;
    }
    const cost = counterCost ? Number(counterCost.replace(",", ".")) : null;
    post({ mode: "counter", date, counterValue: value, costEur: cost });
  }

  function submitBill() {
    const k = kwh ? Number(kwh.replace(",", ".")) : null;
    const c = cost ? Number(cost.replace(",", ".")) : null;
    if (k == null && c == null) {
      toast({ title: "Escreve pelo menos um valor", description: "Preenche os kWh da fatura ou o valor em euros (ou ambos).", variant: "destructive" });
      return;
    }
    post({ mode: "bill", year: Number(year), month: Number(month), kwh: k, costEur: c });
  }

  if (houses.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Adiciona primeiro uma casa no separador «Casas».
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      {/* escolher a casa */}
      <Card>
        <CardContent className="grid gap-4 p-4 @min-[640px]:p-5">
          <div className="grid gap-2">
            <Label htmlFor="house">Casa</Label>
            <Select value={houseId} onValueChange={setHouseId}>
              <SelectTrigger id="house" className="h-11">
                <SelectValue placeholder="Escolhe a casa" />
              </SelectTrigger>
              <SelectContent>
                {houses.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: h.color }} />
                      {h.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="counter">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="counter" className="min-h-11 gap-1.5 py-2">
            <Gauge className="h-4 w-4" aria-hidden /> Leitura do contador
          </TabsTrigger>
          <TabsTrigger value="bill" className="min-h-11 gap-1.5 py-2">
            <FileText className="h-4 w-4" aria-hidden /> Fatura do mês
          </TabsTrigger>
        </TabsList>

        {/* ---- modo leitura do contador ---- */}
        <TabsContent value="counter">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Nova leitura do contador</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 @min-[640px]:p-5">
              <p className="text-sm text-muted-foreground">
                Escreve o número que está no mostrador do contador de{" "}
                {selectedHouse?.name ?? "a casa"} e a data em que leste. A app
                calcula sozinha o consumo desde a última leitura.
              </p>
              {lastCounter && (
                <div
                  role="status"
                  className="rounded-md border bg-muted/60 px-3 py-2 text-sm text-muted-foreground"
                >
                  Última leitura:{" "}
                  <strong className="text-foreground">
                    {lastCounter.counterValue?.toLocaleString("pt-PT")} kWh
                  </strong>{" "}
                  em {MESES[lastCounter.month - 1]} de {lastCounter.year}.
                </div>
              )}
              <div className="grid gap-4 @min-[640px]:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="date">Data da leitura</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="counter">Número do contador (kWh)</Label>
                  <Input
                    id="counter"
                    inputMode="decimal"
                    placeholder="ex.: 25431"
                    value={counterValue}
                    onChange={(e) => setCounterValue(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
              <div className="grid gap-2 @min-[640px]:max-w-[50%]">
                <Label htmlFor="counterCost">
                  Valor pago, se souberes (€) <span className="text-muted-foreground">(facultativo)</span>
                </Label>
                <Input
                  id="counterCost"
                  inputMode="decimal"
                  placeholder="ex.: 132,10"
                  value={counterCost}
                  onChange={(e) => setCounterCost(e.target.value)}
                  className="h-11"
                />
              </div>
              <Button onClick={submitCounter} disabled={saving} className="h-11 w-full @min-[640px]:w-auto @min-[640px]:self-start">
                <Save className="mr-1.5 h-4 w-4" aria-hidden />
                {saving ? "A guardar…" : "Guardar leitura"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- modo fatura do mês ---- */}
        <TabsContent value="bill">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fatura do mês</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 @min-[640px]:p-5">
              <p className="text-sm text-muted-foreground">
                Sabes os kWh e o valor da fatura de um mês? Regista aqui — útil
                para meses passados ou para juntar outras casas.
              </p>
              <div className="grid gap-4 @min-[640px]:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="month">Mês</Label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger id="month" className="h-11">
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
                  <Label htmlFor="year">Ano</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger id="year" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 @min-[640px]:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="kwh">Consumo (kWh)</Label>
                  <Input
                    id="kwh"
                    inputMode="decimal"
                    placeholder="ex.: 541"
                    value={kwh}
                    onChange={(e) => setKwh(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cost">Valor pago (€)</Label>
                  <Input
                    id="cost"
                    inputMode="decimal"
                    placeholder="ex.: 132,10"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
              <Button onClick={submitBill} disabled={saving} className="h-11 w-full @min-[640px]:w-auto @min-[640px]:self-start">
                <Save className="mr-1.5 h-4 w-4" aria-hidden />
                {saving ? "A guardar…" : "Guardar fatura"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
