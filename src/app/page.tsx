"use client";

import * as React from "react";
import {
  Cloud, CloudOff, FileText, History, Home as HomeIcon, LayoutDashboard, Loader2,
  Monitor, PencilLine, RefreshCw, Scale, Smartphone, Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { DashboardTab } from "@/components/tabs-dashboard";
import { RegisterTab } from "@/components/tabs-register";
import { HistoryTab } from "@/components/tabs-history";
import { HousesTab } from "@/components/tabs-houses";
import { InvoicesTab } from "@/components/tabs-invoices";
import { ErseTab } from "@/components/tabs-erse";
import { PlayersTab } from "@/components/tabs-players";
import type { House, Invoice, Operator, Reading } from "@/lib/appTypes";
import {
  arrancarSync, ensureSeed, loadAll, onDadosRemotos, subscribeSync, syncAgora,
  type EstadoSync,
} from "@/lib/localdb";

// caminho base (vazio na Vercel; /LuzIA no GitHub Pages)
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Vista = "auto" | "mobile" | "pc";

export default function Home() {
  const [houses, setHouses] = React.useState<House[]>([]);
  const [readings, setReadings] = React.useState<Reading[]>([]);
  const [operators, setOperators] = React.useState<Operator[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const { houses: h, readings: r, operators: o, invoices: i } = await loadAll();
      setHouses(h);
      setReadings(r);
      setOperators(o);
      setInvoices(i);
    } catch {
      // deixa os esqueletos no ecrã se a base local não estiver disponível
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        await ensureSeed();
      } finally {
        if (ativo) {
          refresh();
          void arrancarSync(); // liga à verdade partilhada e agenda os ciclos
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, [refresh]);

  // estado da sincronização (o pontinho no topo) e chegada de dados remotos
  const [syncEstado, setSyncEstado] = React.useState<EstadoSync>("sincronizado");
  const [syncUltima, setSyncUltima] = React.useState<string | null>(null);
  React.useEffect(() => {
    return subscribeSync((e, u) => {
      setSyncEstado(e);
      setSyncUltima(u);
    });
  }, []);
  React.useEffect(() => {
    return onDadosRemotos(() => {
      void refresh();
    });
  }, [refresh]);

  // vista: automática (segue o ecrã), telemóvel ou PC — fica guardada no aparelho
  const [vista, setVista] = React.useState<Vista>("auto");
  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem("luzia-vista");
      if (v === "mobile" || v === "pc") setVista(v);
    } catch {
      // sem localStorage (modo privado), fica na automática
    }
  }, []);
  const escolherVista = (v: Vista) => {
    const nova: Vista = vista === v ? "auto" : v;
    setVista(nova);
    try {
      window.localStorage.setItem("luzia-vista", nova);
    } catch {
      // ignora: a escolha vale só para esta visita
    }
  };

  // rótulo e dica do indicador de sincronização
  const rotuloSync =
    syncEstado === "a-sincronizar"
      ? "A sincronizar…"
      : syncEstado === "sem-internet"
        ? "Sem internet"
        : syncEstado === "erro"
          ? "Erro — tocar p/ tentar"
          : syncUltima
            ? `Sincronizado ${new Date(syncUltima).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`
            : "Sincronizado";
  const tituloSync =
    syncEstado === "sincronizado"
      ? "Tudo igual em todos os aparelhos — carrega para sincronizar agora"
      : syncEstado === "a-sincronizar"
        ? "A trazer e a enviar a verdade partilhada…"
        : syncEstado === "sem-internet"
          ? "Sem internet: os registos ficam aqui e sobem sozinhos quando ela voltar"
          : "Algo falhou — carrega para tentar de novo";

  return (
    <div
      className={
        "@container flex min-h-screen flex-col bg-background text-foreground " +
        (vista === "mobile"
          ? "mx-auto w-full max-w-[430px] shadow-sm ring-1 ring-border"
          : vista === "pc"
            ? "w-full min-w-[1040px]"
            : "w-full")
      }
    >
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 @min-[640px]:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src={`${BP}/logo-luzia.png`}
              alt=""
              aria-hidden
              className="h-9 w-9 shrink-0 rounded-lg object-cover @min-[640px]:h-10 @min-[640px]:w-10"
            />
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight @min-[640px]:text-lg">
                LuzIA
              </h1>
              <p className="hidden text-xs text-muted-foreground @min-[640px]:block">
                Consumos de eletricidade — a tua casa, o vizinho e quem mais vier
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={syncAgora}
              title={tituloSync}
              aria-live="polite"
              className="flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {syncEstado === "a-sincronizar" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : syncEstado === "sincronizado" ? (
                <Cloud className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              ) : syncEstado === "sem-internet" ? (
                <CloudOff className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-amber-600" aria-hidden />
              )}
              <span className="hidden @min-[640px]:inline">{rotuloSync}</span>
            </button>
            <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
              <button
                type="button"
                onClick={() => escolherVista("mobile")}
                aria-pressed={vista === "mobile"}
                title="Vista telemóvel — carrega outra vez para voltar ao automático"
                className={
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors " +
                  (vista === "mobile"
                    ? "bg-amber-500 text-black"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground")
                }
              >
                <Smartphone className="h-4 w-4" />
                <span className="sr-only">Vista telemóvel</span>
              </button>
              <button
                type="button"
                onClick={() => escolherVista("pc")}
                aria-pressed={vista === "pc"}
                title="Vista PC — carrega outra vez para voltar ao automático"
                className={
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors " +
                  (vista === "pc"
                    ? "bg-amber-500 text-black"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground")
                }
              >
                <Monitor className="h-4 w-4" />
                <span className="sr-only">Vista PC</span>
              </button>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 @min-[640px]:px-6 @min-[640px]:py-6">
        {loading ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 @min-[640px]:grid-cols-2">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
            <Skeleton className="h-80 w-full rounded-xl" />
          </div>
        ) : (
          <Tabs defaultValue="painel" className="w-full">
            <TabsList className="mb-4 grid h-auto w-full grid-cols-4 gap-1 @min-[640px]:grid-cols-7">
              <TabsTrigger value="painel" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs @min-[640px]:gap-1 @min-[640px]:text-sm">
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                Painel
              </TabsTrigger>
              <TabsTrigger value="registar" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs @min-[640px]:gap-1 @min-[640px]:text-sm">
                <PencilLine className="h-4 w-4" aria-hidden />
                Registar
              </TabsTrigger>
              <TabsTrigger value="historico" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs @min-[640px]:gap-1 @min-[640px]:text-sm">
                <History className="h-4 w-4" aria-hidden />
                Histórico
              </TabsTrigger>
              <TabsTrigger value="casas" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs @min-[640px]:gap-1 @min-[640px]:text-sm">
                <HomeIcon className="h-4 w-4" aria-hidden />
                Casas
              </TabsTrigger>
              <TabsTrigger value="faturas" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs @min-[640px]:gap-1 @min-[640px]:text-sm">
                <FileText className="h-4 w-4" aria-hidden />
                Faturas
              </TabsTrigger>
              <TabsTrigger value="erse" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs @min-[640px]:gap-1 @min-[640px]:text-sm">
                <Scale className="h-4 w-4" aria-hidden />
                ERSE
              </TabsTrigger>
              <TabsTrigger value="ofertas" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs @min-[640px]:gap-1 @min-[640px]:text-sm">
                <Sparkles className="h-4 w-4" aria-hidden />
                Ofertas
              </TabsTrigger>
            </TabsList>

            <TabsContent value="painel">
              {houses.length === 0 ? (
                <EmptyHouses />
              ) : (
                <DashboardTab houses={houses} readings={readings} />
              )}
            </TabsContent>

            <TabsContent value="registar">
              <RegisterTab houses={houses} readings={readings} onSaved={refresh} />
            </TabsContent>

            <TabsContent value="historico">
              <HistoryTab houses={houses} readings={readings} onRefresh={refresh} />
            </TabsContent>

            <TabsContent value="casas">
              <HousesTab houses={houses} onRefresh={refresh} />
            </TabsContent>

            <TabsContent value="faturas">
              <InvoicesTab
                houses={houses}
                invoices={invoices}
                operators={operators}
                onRefresh={refresh}
              />
            </TabsContent>

            <TabsContent value="erse">
              <ErseTab operators={operators} houses={houses} readings={readings} />
            </TabsContent>

            <TabsContent value="ofertas">
              <PlayersTab operators={operators} onRefresh={refresh} />
            </TabsContent>
          </Tabs>
        )}
      </main>

      <footer className="mt-auto border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 text-center text-xs text-muted-foreground @min-[640px]:px-6">
          Os bónus e preços das ofertas podem mudar a qualquer momento — confirma
          nos sites oficiais antes de contratar.
        </div>
      </footer>
    </div>
  );
}

function EmptyHouses() {
  return (
    <Card>
      <CardContent className="p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Bem-vindo! Ainda não há casas registadas. Vai ao separador{" "}
          <strong className="text-foreground">«Casas»</strong> para adicionar a
          tua e a do vizinho — depois volta ao Painel para veres os gráficos.
        </p>
      </CardContent>
    </Card>
  );
}
