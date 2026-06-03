# Brasfoot Moderno

**▶ Jogue agora: [jogospauloclaude.paulonetto3420.workers.dev](https://jogospauloclaude.paulonetto3420.workers.dev/)**

Clone moderno do Brasfoot rodando 100% no navegador. Construído em JavaScript puro (ES Modules), sem dependências de runtime, com persistência via IndexedDB.

Simulação de gestão de futebol brasileiro com Brasileirão Série A, B e C, Copa do Brasil e Campeonatos Estaduais rodando em paralelo, mercado de transferências em duas vias, categoria de base, treinamento semanal, motor de partida ao vivo e ciclo completo de temporadas.

## Funcionalidades

### Núcleo do jogo
- **60 clubes** em três divisões (Série A, B e C), com elencos gerados proceduralmente
- **Motor de partida ao vivo** minuto a minuto, com playback animado, barra de progresso e controle de velocidade (1x / 2x / 4x / Pular)
- **Substituições durante a partida** — 5 trocas em até 3 paradas (regra FIFA moderna)
- **6 formações táticas** (4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 5-3-2, 4-5-1) com modificadores reais de ataque e defesa
- **Forma e moral** de cada jogador influenciam o desempenho em campo
- **Lesões e suspensões** com gravidade variável

### Competições
- **Brasileirão Série A e B** — 38 rodadas em pontos corridos, espelhamento turno/returno e mando balanceado
- **Brasileirão Série C** — formato real: 1ª fase em pontos corridos → quadrangulares → final, com acesso à Série B
- **Copa do Brasil** — 6 fases (1ª, 2ª, 3ª, Oitavas, Quartas, Semi, Final), sorteio aleatório até as oitavas, chaveamento fixo depois, ida e volta com agregado e disputa de pênaltis
- **Campeonatos Estaduais** como pré-temporada (MVP: SP, RJ, MG, RS) com fase de grupos e mata-mata
- **Fim de temporada** com promoção, rebaixamento entre as três divisões, premiação e nova edição da Copa

### Gestão
- **Mercado de transferências em duas vias** — você compra (agentes livres e jogadores de outros clubes) e recebe propostas pelos seus, com contrapropostas; janelas de transferência ativas
- **Pedidos de transferência** — jogadores insatisfeitos pedem pra sair
- **Categoria de base** — geração sazonal de jovens prospectos, com promoção, venda ou liberação
- **Treinamento semanal** com foco escolhível (ataque, defesa, físico, técnica, goleiro, recuperação)
- **Renovação de contrato** com negociação baseada em salário, idade, moral e características
- **Finanças** com bilheteria, folha salarial semanal e premiação por desempenho
- **Inbox de notícias** com manchetes geradas automaticamente

### Interface
- **Dashboard estilo Brasfoot clássico** com sidebar de navegação e topbar de status
- **Responsivo** — funciona em desktop, tablet e celular (a sidebar vira menu deslizante no mobile)
- **Tema dinâmico** — as cores do menu se adaptam ao clube que você dirige
- **Escudos dos clubes** integrados em toda a interface
- **Tela de partida ao vivo** com barra de progresso, celebração de gol e jogos paralelos em tempo real
- **Modal visual de fim de temporada** com campeões, promoções e rebaixamentos
- **Toasts e diálogos no tema** (sem alertas nativos do navegador)
- **Persistência automática** via IndexedDB — recarregar a página retoma de onde parou

## Tecnologia

- **JavaScript ES Modules** puro, sem build step nem dependências de runtime
- **HTML/CSS** com variáveis CSS para o tema dinâmico e responsividade
- **IndexedDB** para persistência do estado completo (60 times, milhares de jogadores, fixtures, histórico)
- **PRNG determinístico** (mulberry32) para reprodutibilidade
- **Testes** com o runner nativo do Node (`node --test`), sem dependências
- **Deploy** via Cloudflare Workers (static assets)

## Como rodar localmente

Como o projeto usa `<script type="module">`, é necessário servir os arquivos via HTTP (abrir o `index.html` direto pelo `file://` não funciona por causa de CORS).

```bash
cd brasfoot
python -m http.server 8000
```

Acesse `http://localhost:8000`. Alternativamente, use a extensão **Live Server** do VS Code ou `npx http-server`.

## Testes

A lógica do jogo (engine) é pura e testável sem navegador. 56 testes cobrindo ligas, Copa, Série C, mercado e estaduais:

```bash
cd brasfoot
npm test
```

## Estrutura do projeto

```
brasfoot/
├── index.html               # Shell principal
├── data/                    # Seeds dos clubes e escudos
├── test/                    # Suíte de testes (node --test)
└── src/
    ├── main.js              # Bootstrap, shell e wiring de eventos
    ├── db.js                # Wrapper IndexedDB
    ├── core/
    │   ├── store.js         # Estado central (live bindings)
    │   ├── season-flow.js   # Fluxo de rodada e temporada
    │   └── match-apply.js   # Aplicação de resultados
    ├── ui/
    │   ├── styles.css       # Design system completo
    │   ├── format.js        # Helpers de formatação
    │   ├── theme.js         # Tema dinâmico por clube
    │   ├── modals.js        # Modais (jogador, partida, sorteios, recap)
    │   ├── match-screen.js  # Tela de partida ao vivo
    │   ├── toast.js         # Toasts e diálogos
    │   └── views/           # As 8 telas (escalação, classificação, etc.)
    ├── models/              # Fábricas de time, jogador e competição
    ├── engine/              # Regras puras (match, season, cup, transfers, ...)
    └── utils/rng.js         # PRNG determinístico
```

## Deploy

O jogo é estático puro, publicado via **Cloudflare Workers** com deploy automático a cada push no `main` (config em `wrangler.jsonc`). Para deploy manual:

```bash
npx wrangler deploy
```

## Outros projetos no repositório

- `anime-tower-defense.html` — protótipo de tower defense temático de anime (HTML standalone)

## Status

Em desenvolvimento ativo e jogável de ponta a ponta. Três divisões, Copa do Brasil e Estaduais completos, com mercado, base e treino funcionando. Engine refatorado e coberto por testes.
