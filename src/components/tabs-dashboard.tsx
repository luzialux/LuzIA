"use client";

import * as React from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingDown, TrendingUp, Minus, Home, Zap, Euro } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtKwh, fmtEur, monthLabel, monthKey, fromMonthKey } from "@/lib/appTypes";
import type { House, Reading } from "@/lib/appTypes";

type Metric = "kwh" | "cost";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: p.stroke ?? p.fill }}
          />
          <span>{p.name}:</span>
          <span className="font-semibold">
            {p.dataKey?.toString().endsWith?.("cost")
              ? fmtEur(p.value)
              : fmtKwh(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const cls =
    delta > 0
      ? "text-red-600 dark:text-red-400"
      : delta < 0
        ? "text-green-600 dark:text-green-400"
        : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {delta > 0 ? "+" : ""}
      {delta.toFixed(0)} kWh
    </span>
  );
}

export function DashboardTab({
  houses,
  readings,
}: {
  houses: House[];
  readings: Reading[];
}) {
  const [metric, setMetric] = React.useState<Metric>("kwh");

  // ---- série mensal (todas as casas, metric escolhida) ----
  const data = React.useMemo(() => {
    const map = new Map<number, any>();
    for (const r of readings) {
      const key = monthKey(r.year, r.month);
      if (!map.has(key)) {
        const { year, month } = fromMonthKey(key);
        map.set(key, { key, label: monthLabel(year, month) });
      }
      map.get(key)[r.houseId] =
        metric === "kwh" ? r.kwh : r.costEur;
    }
    return [...map.values()].sort((a, b) => a.key - b.key);
  }, [readings, metric]);

  // últimos 12 meses com dados
  const last12 = React.useMemo(() => data.slice(-12), [data]);

  // ---- KPIs por casa ----
  const kpi = React.useMemo(() => {
    return houses.map((h) => {
      const mine = readings
        .filter((r) => r.houseId === h.id && r.kwh != null)
        .sort((a, b) => monthKey(b.year, b.month) - monthKey(a.year, a.month));
      const last = mine[0] ?? null;
      const prev =
        last != null
          ? mine.find(
              (r) =>
                monthKey(r.year, r.month) ===
                  monthKey(last.year, last.month) - 1
            ) ?? null
          : null;
      const delta =
        last?.kwh != null && prev?.kwh != null
          ? (last.kwh as number) - (prev.kwh as number)
          : null;
      const yearOfLast = last?.year ?? new Date().getFullYear();
      const sameYear = mine.filter((r) => r.year === yearOfLast && r.kwh != null);
      const avg =
        sameYear.length > 0
          ? sameYear.reduce((s, r) => s + (r.kwh ?? 0), 0) / sameYear.length
          : null;
      return { house: h, last, prev, delta, avg, yearOfLast };
    });
  }, [houses, readings]);

  // ---- comparação no mês mais recente comum a todas as casas ----
  const comparison = React.useMemo(() => {
    if (houses.length < 2) return null;
    const keys = readings
      .filter((r) => r.kwh != null)
      .map((r) => monthKey(r.year, r.month));
    if (!keys.length) return null;
    const latestCommon = [...new Set(keys)].sort((a, b) => b - a).find((k) => {
      return houses.every((h) =>
        readings.some(
          (r) => r.houseId === h.id && r.kwh != null && monthKey(r.year, r.month) === k
        )
      );
    });
    if (latestCommon == null) return null;
    const { year, month } = fromMonthKey(latestCommon);
    const vals = houses.map((h) => {
      const r = readings.find(
        (r) => r.houseId === h.id && monthKey(r.year, r.month) === latestCommon
      );
      return { house: h, kwh: r?.kwh ?? null };
    }).filter((v) => v.kwh != null) as { house: House; kwh: number }[];
    if (vals.length < 2) return null;
    const sorted = [...vals].sort((a, b) => b.kwh - a.kwh);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    const pct =
      bottom.kwh > 0 ? ((top.kwh - bottom.kwh) / bottom.kwh) * 100 : null;
    return { year, month, vals, top, bottom, pct };
  }, [houses, readings]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* cartões por casa */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {kpi.map(({ house, last, delta, avg, yearOfLast }) => (
          <Card key={house.id} className="overflow-hidden">
            <div
              aria-hidden
              className="h-1.5 w-full"
              style={{ backgroundColor: house.color }}
            />
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-muted-foreground" aria-hidden />
                <p className="font-semibold">{house.name}</p>
              </div>
              {last ? (
                <>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <div>
                      <p className="text-2xl font-bold tracking-tight sm:text-3xl">
                        {fmtKwh(last.kwh)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        em {monthLabel(last.year, last.month)}
                        {last.costEur != null && ` · ${fmtEur(last.costEur)}`}
                      </p>
                    </div>
                    <DeltaBadge delta={delta} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Média mensal de {yearOfLast}:{" "}
                    <span className="font-medium text-foreground">
                      {avg != null ? `${avg.toFixed(0)} kWh` : "—"}
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Sem consumos registados ainda.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* cartão de comparação entre casas */}
      {comparison && (
        <Card className="border-amber-300/60 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5">
          <CardContent className="p-4 sm:p-5">
            <p className="text-sm text-muted-foreground">
              Comparação em {monthLabel(comparison.year, comparison.month)}
            </p>
            <p className="mt-1 text-lg font-semibold leading-snug">
              {comparison.top.house.name} consumiu{" "}
              {comparison.pct != null ? `${comparison.pct.toFixed(0)}%` : "mais"}{" "}
              {comparison.pct != null ? "a mais" : ""} do que{" "}
              {comparison.bottom.house.name}{" "}
              <span className="font-normal text-muted-foreground">
                ({comparison.top.house.name.split(" ").pop()}{" "}
                {fmtKwh(comparison.top.kwh)} vs{" "}
                {fmtKwh(comparison.bottom.kwh)})
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* gráfico de evolução mensal */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base sm:text-lg">
            Evolução mensal {metric === "kwh" ? "(kWh)" : "(€)"}
          </CardTitle>
          <div className="flex gap-1" role="group" aria-label="Mudar unidade">
            <Button
              size="sm"
              variant={metric === "kwh" ? "default" : "outline"}
              onClick={() => setMetric("kwh")}
              className="h-9"
            >
              <Zap className="mr-1 h-3.5 w-3.5" aria-hidden /> kWh
            </Button>
            <Button
              size="sm"
              variant={metric === "cost" ? "default" : "outline"}
              onClick={() => setMetric("cost")}
              className="h-9"
            >
              <Euro className="mr-1 h-3.5 w-3.5" aria-hidden /> €
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {houses.map((h) => (
              <span key={h.id} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: h.color }}
                />
                {h.name}
              </span>
            ))}
          </div>
          <div
            className="h-[260px] w-full text-muted-foreground sm:h-[320px]"
            dir="ltr"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  axisLine={{ stroke: "currentColor", strokeOpacity: 0.25 }}
                  tickLine={false}
                  minTickGap={56}
                />
                <YAxis
                  width={48}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                {houses.map((h, i) => (
                  <Line
                    key={h.id}
                    dataKey={h.id}
                    name={h.name}
                    stroke={h.color}
                    strokeWidth={2}
                    dot={{ r: 2, fill: h.color, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    strokeDasharray={i === 1 ? "6 3" : undefined}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* barras lado a lado — últimos 12 meses */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">
            Comparação lado a lado — últimos 12 meses (kWh)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {houses.map((h) => (
              <span key={h.id} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: h.color }}
                />
                {h.name}
              </span>
            ))}
          </div>
          <div
            className="h-[260px] w-full text-muted-foreground sm:h-[320px]"
            dir="ltr"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last12} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  axisLine={{ stroke: "currentColor", strokeOpacity: 0.25 }}
                  tickLine={false}
                  minTickGap={56}
                />
                <YAxis
                  width={48}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "currentColor", fillOpacity: 0.06 }} />
                {houses.map((h) => (
                  <Bar
                    key={h.id}
                    dataKey={h.id}
                    name={h.name}
                    fill={h.color}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={18}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
