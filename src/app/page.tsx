"use client";

import * as React from "react";
import {
  FileText, History, Home as HomeIcon, LayoutDashboard, PencilLine, Scale,
  Sparkles,
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
import { ensureSeed, loadAll } from "@/lib/localdb";

// caminho base (vazio na Vercel; /LuzIA no GitHub Pages)
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

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
        if (ativo) refresh();
      }
    })();
    return () => {
      ativo = false;
    };
  }, [refresh]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src={`${BP}/logo-luzia.png`}
              alt=""
              aria-hidden
              className="h-9 w-9 shrink-0 rounded-lg object-cover sm:h-10 sm:w-10"
            />
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight sm:text-lg">
                LuzIA
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Consumos de eletricidade — a tua casa, o vizinho e quem mais vier
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:px-6 sm:py-6">
        {loading ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
            <Skeleton className="h-80 w-full rounded-xl" />
          </div>
        ) : (
          <Tabs defaultValue="painel" className="w-full">
            <TabsList className="mb-4 grid h-auto w-full grid-cols-4 gap-1 sm:grid-cols-7">
              <TabsTrigger value="painel" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs sm:gap-1 sm:text-sm">
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                Painel
              </TabsTrigger>
              <TabsTrigger value="registar" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs sm:gap-1 sm:text-sm">
                <PencilLine className="h-4 w-4" aria-hidden />
                Registar
              </TabsTrigger>
              <TabsTrigger value="historico" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs sm:gap-1 sm:text-sm">
                <History className="h-4 w-4" aria-hidden />
                Histórico
              </TabsTrigger>
              <TabsTrigger value="casas" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs sm:gap-1 sm:text-sm">
                <HomeIcon className="h-4 w-4" aria-hidden />
                Casas
              </TabsTrigger>
              <TabsTrigger value="faturas" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs sm:gap-1 sm:text-sm">
                <FileText className="h-4 w-4" aria-hidden />
                Faturas
              </TabsTrigger>
              <TabsTrigger value="erse" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs sm:gap-1 sm:text-sm">
                <Scale className="h-4 w-4" aria-hidden />
                ERSE
              </TabsTrigger>
              <TabsTrigger value="ofertas" className="min-h-11 flex-col gap-0.5 py-1.5 text-xs sm:gap-1 sm:text-sm">
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
        <div className="mx-auto w-full max-w-6xl px-4 py-3 text-center text-xs text-muted-foreground sm:px-6">
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
