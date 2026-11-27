"use client";

import * as React from "react";
import { ExternalLink, Zap, Info } from "lucide-react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtKwh, mix, monthKey } from "@/lib/appTypes";
import type { House, Operator, Reading } from "@/lib/appTypes";

const ERSE_SIMULATOR = "https://simuladorprecos.erse.pt";

export function ErseTab({
  operators,
  houses,
  readings,
}: {
  operators: Operator[];
  houses: House[];
  readings: Reading[];
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  // média mensal dos últimos 12 meses de cada casa, para usar no simulador
  const averages = React.useMemo(() => {
    return houses.map((h) => {
      const now = new Date();
      const cutoff = monthKey(now.getFullYear(), now.getMonth() + 1) - 11;
      const last12 = readings.filter(
        (r) =>
          r.houseId === h.id && r.kwh != null && monthKey(r.year, r.month) >= cutoff
      );
      const avg =
        last12.length > 0
          ? last12.reduce((s, r) => s + (r.kwh ?? 0), 0) / last12.length
          : null;
      return { house: h, avg };
    });
  }, [houses, readings]);

  return (
    <div className="flex flex-col gap-4 @min-[640px]:gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base @min-[640px]:text-lg">
            <Zap className="h-5 w-5 text-amber-500" aria-hidden />
            Simulador oficial da ERSE
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            A ERSE é a autoridade que regula a energia em Portugal. O seu{" "}
            <strong className="text-foreground">simulador compara todas as ofertas
            do mercado</strong> — é gratuito e independente das empresas. Para
            obteres resultados à tua medida, escreve lá o consumo mensal das tuas
            casas:
          </p>
          <ul className="grid gap-2 @min-[640px]:grid-cols-2">
            {averages.map(({ house, avg }) => (
              <li
                key={house.id}
                className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-sm"
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: house.color }}
                  />
                  <span className="truncate">{house.name}</span>
                </span>
                <span className="ml-2 shrink-0 font-semibold tabular-nums">
                  {avg != null ? `≈ ${avg.toFixed(0)} kWh/mês` : "sem dados"}
                </span>
              </li>
            ))}
          </ul>
          <Button asChild className="h-12 w-full text-base @min-[640px]:w-auto @min-[640px]:self-start">
            <a
              href={ERSE_SIMULATOR}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir o simulador de preços da ERSE (abre em nova janela)"
            >
              Abrir o simulador da ERSE
              <ExternalLink className="ml-1.5 h-4 w-4" aria-hidden />
            </a>
          </Button>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            O simulador abre no site oficial da ERSE (simuladorprecos.erse.pt),
            num separador novo. Nada se instala, nada se contrata por lá sem
            decidires.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base @min-[640px]:text-lg">
            Operadores — sites oficiais
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            O nome de cada operador tem a <strong className="text-foreground">cor da
            marca</strong> e é um atalho para o site oficial.
          </p>
          <div className="grid grid-cols-1 gap-2 @min-[640px]:grid-cols-2 @min-[1024px]:grid-cols-3">
            {operators.map((op) => {
              const display = dark ? mix(op.brandColor, 0.35) : op.brandColor;
              return (
                <a
                  key={op.id}
                  href={op.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Site oficial da ${op.name} (abre em nova janela)`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
                      style={{ backgroundColor: op.brandColor }}
                    />
                    <span
                      className="truncate text-sm font-semibold"
                      style={{ color: display }}
                    >
                      {op.name}
                    </span>
                  </span>
                  <ExternalLink
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
                    aria-hidden
                  />
                </a>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
