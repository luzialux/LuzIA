# LuzIA

Regista os consumos de eletricidade da tua casa (e do vizinho, e de quem mais
vier), vê a evolução em gráficos, arquiva as faturas em PDF — a app lê-as
sozinha — e compara as ofertas dos novos players com o comparador e o simulador
da ERSE.

**No ar em:** <https://luzia-app.vercel.app/> — o endereço antigo
<https://luz-ia-lake.vercel.app/> continua a funcionar e leva ao mesmo sítio.

## Como funciona

A app tem **uma verdade para todos os aparelhos**: os dados (casas, consumos,
ofertas e faturas) vivem num documento na nuvem (Vercel Blob, junto ao sítio
onde a app está alojada) e sincronizam automaticamente entre telemóvel e
computador — o PDF que carregas no computador aparece no telemóvel do vizinho
em segundos, sem contas nem passwords. Cada aparelho mantém uma cópia local
(IndexedDB): se a internet cair, a app continua a funcionar e o que registares
sobe sozinhos quando ela volta. O que editar por último fica em todos.

- **Registar** — leitura do contador (a app calcula o consumo desde a última
  leitura) ou fatura do mês (kWh e euros).
- **Faturas** — carrega o PDF da fatura: a app tira sozinha o período, o
  consumo, o valor, a tarifa e as leituras do contador, preenche o registo do
  mês e arquiva o PDF (funciona com SU Eletricidade, EDP, Galp, Endesa,
  Iberdrola, Plenitude, Goldenergy e outros).
- **Casas** — adicionar/renomear casas, cores nos gráficos, cópia de segurança
  (exportar/importar um `.json` com tudo, PDFs incluídos).
- **Sincronização** — o indicador no topo mostra o estado (Sincronizado,
  A sincronizar…, Sem internet, Erro); tocar nele força uma sincronização.
- **Vista telemóvel / PC** — dois botões no topo mostram a app como ela fica
  no telemóvel ou no computador, mesmo que estejas no outro aparelho (clicar
  de novo volta à vista automática).
- **ERSE** — ligação ao simulador oficial para comparar tarifas.
- **Ofertas** — comparador dos novos players, com valores editáveis.

## Instalar no telemóvel

Abre o endereço no Chrome (Android) ou no Safari (iPhone) e usa
**«Adicionar ao ecrã principal»** — fica com ícone próprio e abre como uma
app normal.

## Copiar os dados para outro aparelho

Já não é preciso: tudo sincroniza sozinho entre aparelhos. Mesmo assim, a
cópia de segurança continua disponível no separador **Casas**
(«Guardar cópia (.json)»), para trazer tudo para um aparelho novo ou guardar
fora da nuvem.

## Para desenvolver

```bash
bun install
bun run dev      # ambiente de desenvolvimento em localhost:3000
bun run build    # build completo (as rotas /api correm na Vercel)
```

Stack: Next.js (App Router, rotas /api/data e /api/invoice), Tailwind CSS,
shadcn/ui, Recharts, Dexie (IndexedDB), Vercel Blob e pdf.js — a leitura das
faturas corre no navegador.
