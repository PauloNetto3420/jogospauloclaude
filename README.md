# Brasfoot Moderno

Clone moderno do Brasfoot rodando 100% no navegador. Construído em JavaScript puro (ES Modules), sem dependências de runtime, com persistência via IndexedDB.

Projeto desenvolvido como simulação de gestão de futebol brasileiro, com Brasileirão Série A, Série B e Copa do Brasil rodando em paralelo, mercado de transferências, motor de partida ao vivo, sistema de moral/forma e ciclo completo de temporadas.

## Funcionalidades

### Núcleo do jogo
- **40 clubes** divididos em Série A e Série B, com elencos gerados proceduralmente
- **Motor de partida ao vivo** minuto a minuto, com playback animado e controle de velocidade (1x / 2x / 4x / Pular)
- **Substituições durante a partida** — 5 trocas em até 3 paradas (regra FIFA moderna)
- **6 formações táticas** (4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 5-3-2, 4-5-1) com modificadores reais de ataque e defesa
- **Forma e moral** de cada jogador influenciam o desempenho em campo
- **Lesões e suspensões** com gravidade variável (curtas, médias, longas)

### Competições
- **Brasileirão Série A e B** com 38 rodadas em pontos corridos, espelhamento turno/returno e mando balanceado
- **Copa do Brasil** com 6 fases (1ª, 2ª, Oitavas, Quartas, Semi, Final), sorteio aleatório até as oitavas e chaveamento fixo nas fases seguintes
- **Fim de temporada** com promoção, rebaixamento, premiação e nova edição da Copa com os cabeças da Libertadores

### Gestão
- **Mercado de transferências** com agentes livres, propostas por jogadores de outros clubes e IA ativa do resto da liga
- **Renovação de contrato** com negociação flexível baseada em salário, idade, moral e características
- **Finanças** com bilheteria (depende de público e atratividade), folha salarial semanal e premiação por desempenho
- **Inbox de notícias** com manchetes geradas automaticamente (hat-tricks, lesões graves, goleadas, expulsões, campeões)
- **Calendário completo** da temporada com modo "Meus Jogos" e "Calendário Completo"
- **Ficha detalhada de jogadores** com atributos, traits, histórico de transferências e ações contextuais

### Interface
- **Dashboard estilo Brasfoot clássico** com sidebar de navegação e topbar de status
- **Tema dinâmico** — as cores do menu se adaptam ao clube que você dirige
- **Escudos dos clubes** integrados na seleção, classificação, calendário, scoreboard e ficha de partida
- **Modal de detalhe da partida** com escalação, timeline de eventos e estatísticas
- **Persistência automática** via IndexedDB — recarregar a página retoma exatamente de onde parou

## Tecnologia

- **JavaScript ES Modules** puro, sem build step
- **HTML/CSS** com variáveis CSS para o tema dinâmico
- **IndexedDB** para persistência do estado completo (40 times, 1000+ jogadores, fixtures, histórico)
- **PRNG determinístico** (mulberry32) para garantir reprodutibilidade quando necessário

Sem frameworks, sem npm, sem build. Só abrir num servidor estático.

## Como rodar

Como o projeto usa `<script type="module">`, é necessário servir os arquivos via HTTP (abrir o `index.html` direto pelo file:// não funciona por causa de CORS).

```bash
cd brasfoot
python -m http.server 8000
```

E acesse `http://localhost:8000` no navegador. Alternativamente, use a extensão **Live Server** do VS Code.

## Estrutura do projeto

```
brasfoot/
├── index.html               # Shell principal
├── data/
│   ├── teams.seed.js        # Seed dos 40 clubes
│   └── team-logos.js        # Mapeamento de escudos
└── src/
    ├── main.js              # Orquestrador e UI
    ├── db.js                # Wrapper IndexedDB
    ├── ui/styles.css        # Design system completo
    ├── images/              # Escudos dos clubes
    ├── utils/rng.js         # PRNG determinístico
    ├── models/
    │   ├── team.js          # Fábrica de times
    │   ├── player.js        # Geração procedural de jogadores
    │   └── competition.js   # Round-robin (turno + returno)
    └── engine/
        ├── match.js         # Simulador stateful da partida
        ├── season.js        # Rodadas, classificação, efeitos
        ├── season-end.js    # Promoção, rebaixamento, envelhecimento
        ├── cup.js           # Copa do Brasil
        ├── finance.js       # Bilheteria e folha
        ├── transfers.js     # Mercado e renovações
        └── news.js          # Geração de manchetes
```

## Outros projetos no repositório

- `anime-tower-defense.html` — protótipo de tower defense temático de anime (HTML standalone)

## Status

Em desenvolvimento ativo. Brasileirão e Copa do Brasil estão completos e jogáveis. Próximas frentes possíveis: treinamento semanal, visualização em chaveamento da copa, premiação detalhada por desempenho na copa, e expansão de escudos para a Série B.
