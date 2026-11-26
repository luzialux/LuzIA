# Luz em Casa

Regista os consumos de eletricidade da tua casa (e do vizinho, e de quem mais
vier), vê a evolução em gráficos, arquiva as faturas em PDF — a app lê-as
sozinha — e compara as ofertas dos novos players com o comparador e o simulador
da ERSE.

**No ar em:** <https://luz-ia-lake.vercel.app/>

## Como funciona

A app corre por inteiro no **telemóvel/computador**: o build é um site estático
e os dados ficam guardados no próprio aparelho (IndexedDB), sem contas, sem
servidor e sem base de dados na nuvem. Se a internet cair, a app continua a
funcionar.

- **Registar** — leitura do contador (a app calcula o consumo desde a última
  leitura) ou fatura do mês (kWh e euros).
- **Faturas** — carrega o PDF da fatura: a app tira sozinha o período, o
  consumo, o valor, a tarifa e as leituras do contador, preenche o registo do
  mês e arquiva o PDF (funciona com SU Eletricidade, EDP, Galp, Endesa,
  Iberdrola, Plenitude, Goldenergy e outros).
- **Casas** — adicionar/renomear casas, cores nos gráficos, cópia de segurança
  (exportar/importar um `.json` com tudo, PDFs incluídos).
- **ERSE** — ligação ao simulador oficial para comparar tarifas.
- **Ofertas** — comparador dos novos players, com valores editáveis.

## Instalar no telemóvel

Abre o endereço no Chrome (Android) ou no Safari (iPhone) e usa
**«Adicionar ao ecrã principal»** — fica com ícone próprio e abre como uma
app normal.

## Copiar os dados para outro aparelho

No separador **Casas**: «Guardar cópia (.json)» no aparelho antigo e depois
«Trazer os teus dados» no novo. Nada se duplica.

## Para desenvolver

```bash
bun install
bun run dev      # ambiente de desenvolvimento em localhost:3000
bun run build    # gera o site estático na pasta out/
```

Stack: Next.js (App Router, export estático), Tailwind CSS, shadcn/ui,
Recharts, Dexie (IndexedDB) e pdf.js — a leitura das faturas corre no
navegador.
