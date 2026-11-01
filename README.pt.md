<!-- source: README.md sha256:7a71e523a772 · machine -->
[English](README.md) · [Русский](README.ru.md) · [Беларуская](README.be.md) · [Українська](README.uk.md) · [Қазақша](README.kk.md) · [Polski](README.pl.md) · [Deutsch](README.de.md) · [Español](README.es.md) · **Português** · [Français](README.fr.md) · [Nederlands](README.nl.md) · [Română](README.ro.md)

> Esta página é uma tradução automática do README em inglês, que é o texto que faz fé. As correções são bem-vindas através do formulário [Tradução da documentação](https://github.com/Dopetast1c/Marksy/issues/new?template=docs-translation.yml).

# Marksy

**O ano letivo das crianças, num só lugar, calmo e claro.**

O Marksy é uma aplicação familiar para as notas escolares, de código disponível e gratuita para uso pessoal e qualquer outro uso não comercial. Liga-se à caderneta eletrónica que a escola já usa, lê as notas, o horário e os trabalhos de casa através da própria API da caderneta e constrói por cima uma camada mais rica: médias e tendências de cada disciplina e período, o histórico completo de cada nota, um plano para os próximos dias, um temporizador de estudo, notificações e uma conta própria para cada responsável e cada criança. Funciona no seu próprio computador, instala-se como aplicação em qualquer telemóvel e fala doze línguas.

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)
![PWA](https://img.shields.io/badge/app-PWA-5a0fc8.svg)
![Self-hosted](https://img.shields.io/badge/data-self--hosted-2f7a4a.svg)

> **Estado: 1.0, a primeira versão.** As notas, as notas finais, as disciplinas, o horário com os trabalhos de casa, a família e o aspeto da aplicação funcionam e são usados todos os dias, em casa, num computador que se atualiza sozinho. As etiquetas, o tempo de estudo, a aplicação instalável com modo offline e as notificações vêm a seguir, por esta ordem ([`docs/build-plan.md`](docs/build-plan.md)). As secções abaixo descrevem o produto completo.

## A ideia

A caderneta escolar é a fonte de verdade: os professores registam lá todos os dias notas, sumários, trabalhos de casa e o horário, e a caderneta disponibiliza-os através da sua API. São muitos dados valiosos, e grande parte do seu valor surge com o tempo e ao olhar para várias disciplinas ao mesmo tempo: como está a correr uma disciplina neste período, o que mudou desde ontem, que teste há na terça-feira, se esta semana correu melhor do que a anterior.

O Marksy pega nesses dados e constrói sobre eles para a família:

- **Lembra-se.** Cada nota é guardada com todo o seu histórico, por isso a família vê não só onde as coisas estão, mas também como lá chegaram, incluindo notas que foram corrigidas mais tarde.
- **Resume.** Médias por disciplina para uma semana, um mês, um período ou um ano, comparadas com o intervalo anterior, com a distribuição das notas e uma tendência.
- **Antecipa.** As aulas de amanhã com os trabalhos de casa, os próximos testes e o que é preciso decorar, destacados com dias de antecedência.
- **Junta a família.** Uma só conta da caderneta serve a família inteira; cada responsável e cada criança tem a sua própria conta, as suas próprias notificações e a sua própria vista.
- **Viaja.** O sistema de caderneta é um módulo. Tudo o resto, cada ecrã e cada número, é partilhado, por isso um novo país, região ou escola recebe a aplicação inteira acrescentando um pequeno fornecedor.

## O que oferece

### Início

O dia num relance. Dois números para o período escolhido, a média e o número de notas, cada um com o valor do período anterior. Depois, as notas de hoje, o tempo de estudo, o bloco **Atenção** (as poucas coisas que merecem um olhar agora mesmo: uma nota baixa, um teste a chegar, uma média a descer, algo para levar amanhã) e as aulas de amanhã com os trabalhos de casa. Mais abaixo, as estatísticas: notas por nível, a distribuição por valor e uma tendência por semana, mês, período ou ano.

Todos os ecrãs com números têm o mesmo controlo de período: escolha uma semana, um mês, um período ou um ano e recue para qualquer um anterior com as setas, deslizando o dedo ou a partir de uma lista.

### Notas

Todas as notas numa só lista, agrupadas por dia, com a disciplina, o tipo de trabalho, o sumário da aula e o comentário de docente. Filtre por etiquetas como «Teste» ou «Poema», uma ou várias de cada vez. A um toque de distância estão as **notas finais**: uma tabela com os resultados por período e por ano de cada disciplina, em que um período ainda a decorrer mostra a média atual, para que uma tendência nunca seja confundida com um resultado final.

### Disciplinas

Todas as disciplinas da criança, sempre: a média no período, o sentido em que está a evoluir, o valor anterior e as últimas notas. Ordene alfabeticamente, das mais fracas para as mais fortes ou ao contrário, ou pela maior subida ou descida. Nas turmas em que ainda não há notas, a mesma lista mostra em vez disso as aulas, os trabalhos de casa e o tempo de estudo.

### Uma disciplina de perto

Cada disciplina tem a sua própria página, com a cor da disciplina: o objetivo do período («para um 8 precisa de dois 9 ou de um 10»), o que merece atenção, estatísticas e tendência, cada nota com o seu comentário, as próximas aulas, os resultados período a período e o tempo de estudo.

### Horário e trabalhos de casa

Um dia ou uma semana inteira, para trás e para a frente, uma linha por aula com a hora, a sala, o sumário, os trabalhos de casa e a nota dessa aula; antes de uma aula, a média da disciplina e as últimas notas logo por baixo. As aulas para as quais a criança se preparou recebem uma marca **feito** que toda a família vê. As famílias podem acrescentar trabalhos de casa próprios e marcar uma aula como cancelada. Os intervalos do dia aparecem como intervalos, por isso uma entrada mais tarde vê-se de imediato.

### Etiquetas

Diga ao Marksy o que importa com as palavras da sua própria escola: um poema para decorar, um teste, algo para levar. Uma etiqueta é um punhado de palavras-chave que o Marksy procura nos sumários das aulas e nos trabalhos de casa. As aulas com etiqueta ficam destacadas no horário e aparecem no ecrã inicial com dias de antecedência, com as palavras exatas que coincidiram. Cada língua traz etiquetas prontas a usar, que podem ser editadas à vontade.

### Tempo de estudo

Um temporizador para os trabalhos de casa, iniciado a partir de uma aula ou de uma disciplina, com pausa e fim, e uma pequena barra que fica no ecrã enquanto está a contar. Terminar uma sessão e marcar uma aula como feita são coisas separadas, porque uma pausa não é o fim. Quando o temporizador não foi usado, o Marksy estima o tempo a partir das marcas «feito» da noite e indica que se trata de uma estimativa. O tempo é mostrado por dia e por disciplina, de forma simples e sem juízos.

### Notificações

Uma notificação push no telemóvel ou uma mensagem no Telegram quando algo acontece: uma nota nova, uma nota abaixo de um nível escolhido, uma nota corrigida, uma falta, um teste a chegar, um resumo dos trabalhos de casa ao fim do dia, um resumo semanal. Cada regra é definida por pessoa, com horas de silêncio. Tudo o que foi enviado fica numa caixa de entrada na aplicação, por isso uma notificação descartada nunca se perde.

### Família

A família liga a caderneta uma única vez. Cada membro recebe a sua própria conta no Marksy através de um convite: os restantes responsáveis, os avós, cada criança. As crianças nunca precisam da palavra-passe da caderneta. Famílias amigas podem criar a sua no mesmo servidor; as famílias nunca veem os dados umas das outras.

### O seu aspeto, a sua língua

Temas claro e escuro, paletas de cores, papéis de parede, cinco tipos de letra para o texto, uma cor para cada disciplina. Doze línguas de interface: russo, bielorrusso, ucraniano, cazaque, inglês, polaco, alemão, espanhol, português, francês, neerlandês e romeno, escolhidas por cada pessoa. O inglês e o russo são revistos por pessoas; as outras dez são traduções automáticas, assinaladas como tal na aplicação, que remete para um pequeno formulário de correções. Acrescentar uma língua é um ficheiro JSON ([`docs/i18n.md`](docs/i18n.md)).

## Veja já

Abra [`docs/mockups.html`](docs/mockups.html) num navegador. É um protótipo clicável, pensado primeiro para o telemóvel, de todos os ecrãs com dados fictícios: alterne entre a vista de responsável e a de criança, entre duas crianças, entre claro e escuro. A aplicação é construída para lhe corresponder.

## Como funciona

```
 ┌───────────────────┐  provider: students, calendar, lessons,  ┌──────────────────────────────┐
 │ school diary      │  marks, homework, final marks            │  Marksy server               │
 │ (through its API) │ <─────────────────────────────────────── │  Node.js + Express           │
 │                   │ ───────────────────────────────────────> │  collector, API, guidance    │
 └───────────────────┘  read-only, serial, gentle               │  PostgreSQL 16               │
                                                                └──────────────┬───────────────┘
                                                                               │ HTTPS, sessions
                                                                ┌──────────────┴───────────────┐
                                                                │  Marksy app (PWA, React)     │
                                                                │  parents and children        │
                                                                └──────────────────────────────┘
```

- **Fornecedor.** Um pequeno módulo por sistema de caderneta. Inicia sessão com as credenciais da família e devolve estudantes, períodos, disciplinas, aulas com notas e trabalhos de casa, e notas finais no formato comum do Marksy. Declara o que o seu sistema oferece (tipos de aula, comentários, assiduidade, períodos, um horário futuro) e a sua escala de classificação, e a aplicação adapta-se exatamente a isso.
- **Coletor.** O mesmo para todos os fornecedores. Algumas vezes durante o dia de aulas vai buscar as semanas recentes de cada criança, deteta notas novas, alteradas e removidas, guarda o histórico de cada alteração e volta a ler o período inteiro uma vez por semana, porque os professores editam notas antigas. Funciona como um planeador: se o computador esteve desligado num fim de semana, a primeira execução a seguir recupera o que ficou para trás.
- **API.** Serve os dados guardados à aplicação, limitados a uma família, e documenta-se com OpenAPI em `/api/docs`.
- **Aplicação.** Uma PWA em React com uma estrutura offline, instalável em iOS e Android, testada em telemóveis reais através da rede de casa desde os primeiros ecrãs.

## Qualquer escola, qualquer escala

O Marksy trabalha com um modelo comum (estudantes, períodos, disciplinas, aulas, notas, notas finais) e com uma descrição da **escala de classificação** fornecida pelo fornecedor: o intervalo e o sentido, quatro níveis, limiares, objetivos, como as médias são calculadas e mostradas, como as notas finais são arredondadas. Uma escala de 10 pontos, de 5, de 12, de 1 a 6 em que 1 é a melhor, de 0 a 20, letras com GPA, percentagens, aprovado ou não aprovado: os mesmos ecrãs, médias, filtros, objetivos e sugestões funcionam com cada uma, mesmo quando a escala muda de um ano letivo para outro ou entre disciplinas.

Tudo o que uma caderneta pode ter ou não é opcional: tipos de aula, categorias de notas, comentários, assiduidade, períodos, notas finais oficiais, até o horário. Um fornecedor declara o que existe, e cada ecrã mostra o que há em vez de colunas vazias.

Para ligar um sistema novo, escreve-se um fornecedor: um manifesto (credenciais, escala, capacidades, limites de pedidos), uma função de início de sessão, algumas funções de obtenção que convertem as respostas nos tipos comuns, um `sanitize()` para os fixtures de teste e o teste de conformidade partilhado. [`docs/adding-a-diary.md`](docs/adding-a-diary.md) explica o que isso implica e como pedir o sistema da sua escola; o contrato completo e uma lista de verificação estão em [`docs/providers.md`](docs/providers.md), e `providers/_template` é um ponto de partida que compila.

## Respeitador por natureza

- **Só leitura.** O Marksy apenas lê. O cliente HTTP partilhado recusa qualquer pedido fora da lista permitida do fornecedor, por isso nada na caderneta pode ser alterado por engano.
- **Discreto.** No máximo um início de sessão por hora e por conta, um pedido de cada vez com pausas, espera crescente perante erros, um limite por execução. A atualização manual partilha o mesmo orçamento.
- **Resiliente.** Cada tentativa e cada semana verificada ficam registadas. As falhas, de qualquer um dos lados, são recuperadas automaticamente; após falhas repetidas, a sincronização faz uma pausa e é enviado um único aviso a quem administra a família. Uma palavra-passe errada para a sincronização até ser corrigida, por isso a conta real nunca fica bloqueada.
- **Atento à rede.** Alguns sistemas de caderneta respondem melhor a partir da sua própria região ou sem VPN. Cada fornecedor declara aquilo de que precisa da rede, e o coletor funciona numa máquina em casa que o cumpre: um PC, um mini PC, um Raspberry Pi, um NAS.
- **Arrumado.** As notas e o seu histórico são guardados enquanto a criança fizer parte da família; os dados operacionais (registos de sincronização, respostas em bruto, fluxos de eventos) são guardados durante semanas ou meses e depois compactados. Os limites estão em `env.example`, em `RETENTION_*`.

## Privacidade

O Marksy trata dados sobre crianças, e as suas predefinições refletem isso.

- **Os seus dados ficam consigo.** Sem análises, sem scripts nem tipos de letra de terceiros; nada sai do seu servidor.
- **Sessões em todo o lado.** Todas as rotas, exceto o início de sessão, o estado do serviço e a documentação da API, exigem uma sessão, e cada consulta é limitada a uma família.
- **Segredos protegidos.** As palavras-passe da caderneta são guardadas encriptadas (AES-256-GCM); as palavras-passe do Marksy são guardadas com hash argon2id. Os registos nunca contêm palavras-passe, tokens nem nomes completos.
- **Nada real no repositório.** Os fixtures de teste são fictícios ou foram limpos; `pnpm privacy` procura segredos, dados pessoais e ficheiros que nunca devem ser enviados para o repositório.
- **As famílias são donas dos seus dados.** Uma família pode exportar tudo em JSON e apagar-se por completo; o tempo de conservação é uma definição. Se alojar o Marksy para outras famílias, leia primeiro `docs/design.md`, secção 14.1.

## Requisitos

- Uma conta numa caderneta escolar suportada (de responsável ou de estudante).
- Um computador ligado durante o dia de aulas, com Docker e nada mais: um PC ou portátil de casa, um mini PC, um Raspberry Pi ou um NAS.
- Opcional: um domínio na Cloudflare, para usar a aplicação fora da rede de casa através do Cloudflare Tunnel, instalá-la nos telemóveis e usar Web Push; um token de bot do Telegram para as notificações no Telegram.
- Para desenvolver o Marksy: Node.js 22, pnpm e Docker.

## Utilização em produção

Para usar o Marksy com a sua família todos os dias, num portátil, num Raspberry Pi ou num NAS, apenas com Docker nesse computador: [docs/running.md](docs/running.md). Abrange a instalação, as formas de chegar à aplicação em casa e fora de casa (Cloudflare Tunnel), as cópias de segurança, o restauro e a mudança para outro computador, e as atualizações. Cada versão traz em anexo os ficheiros de que um servidor precisa, como `marksy-deploy-vX.Y.Z.zip`.

As versões são numeradas MAJOR.MINOR.PATCH: MAJOR é uma remodelação global da aplicação (rara), MINOR traz funcionalidades novas e PATCH traz correções e ajustes. Um servidor instala as versões novas sozinho, em poucos minutos, depois de verificar que foram assinadas por este projeto, com uma cópia de segurança antes e uma forma de voltar atrás se algo correr mal.

## Início rápido para desenvolvimento

O espaço de trabalho executa a aplicação inteira a partir do código-fonte: a base de dados, o coletor com o seu planeador, a API com a sua documentação, a aplicação e uma família de demonstração fictícia para a explorar sem conta numa caderneta. Precisa de Node.js 22, pnpm (`npm install -g pnpm` ou `corepack enable`) e Docker.

```bash
git clone https://github.com/Dopetast1c/Marksy.git
cd Marksy
pnpm setup:env                  # creates .env and generates its secrets
pnpm install                    # also points git at .githooks/ (the pre-commit guard)
pnpm db:up                      # PostgreSQL 16 in Docker: the app database (5432) and an in-memory one for tests (5434)
pnpm db:migrate                 # creates the schema
pnpm db:seed                    # a fictional demo family with demo logins (--reset replaces it)
pnpm check                      # formatting, typecheck, lint, tests, privacy check
pnpm test:provider demo-minimal # the shared conformance suite for one provider
pnpm dev                        # API on :3000, app on :5173, API docs at /api/docs
```

A família de demonstração pertence a uma caderneta fictícia e tem duas crianças, uma delas numa turma sem notas, por isso todos os ecrãs podem ser explorados sem conta numa caderneta; as suas contas (`parent@example.com` e `student@example.com`, com a palavra-passe impressa por `pnpm db:seed`) funcionam assim que o início de sessão estiver disponível. Como essa palavra-passe é pública, o seed recusa-se a correr quando `PUBLIC_URL` é um endereço público (`--allow-public` anula isto). `pnpm db:studio` abre a base de dados no Drizzle Studio. `pnpm db:backup` escreve uma cópia da base de dados local em `data/backups/` (são mantidas as cinco últimas) e verifica-a restaurando-a numa base de dados temporária; `pnpm db:restore <file> --yes` repõe uma. Com uma conta numa caderneta, abra a aplicação, escolha «Ligar uma caderneta», selecione o seu sistema de caderneta e inicie sessão: o Marksy verifica as credenciais uma vez, cria a sua família e começa a primeira sincronização. Convide o resto da família em «Mais» e depois «Família».

Com uma conta numa caderneta, `pnpm dev:connect` cria a sua própria família a partir da linha de comandos: lê a conta da caderneta (`DIARY_LOGIN`, `DIARY_PASSWORD`) e a conta do Marksy que pretende (`MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD`) do `.env` e executa o mesmo código que «Ligar uma caderneta»; se for executado de novo depois de repor a base de dados, só acrescenta o que falta, e sobre `pnpm sync:once` assume essa família sem voltar a iniciar sessão na caderneta. Antes disso, é possível preencher a base de dados local a partir da linha de comandos: coloque a conta da caderneta em `DIARY_LOGIN` e `DIARY_PASSWORD` no `.env` e execute `pnpm sync:once`. Só comunica com sistemas de caderneta oferecidos às famílias, cria uma família mínima na primeira utilização e executa uma sincronização com as mesmas regras de qualquer outra execução (o limite de pedidos, a verificação de ligação, um início de sessão por conta e por intervalo: 10 minutos para os comandos manuais em desenvolvimento, o intervalo próprio do sistema de caderneta em produção); `pnpm probe` lê cada endpoint uma vez e atualiza os fixtures limpos do fornecedor, e `pnpm probe --offline` repete as verificações sobre as respostas guardadas sem iniciar sessão (só reescreve os fixtures com `--write-fixtures`). Os três comandos que iniciam sessão numa caderneta real partilham uma proteção de início de sessão. A proteção pre-commit recusa um commit que inclua dados locais, segredos, cópias da base de dados ou respostas em bruto, ou qualquer nome ou id das últimas respostas reais. Só imprime contagens e estados, e termina com 0 também quando as regras travam a execução. Enquanto `SYNC_ENABLED` for `true`, `pnpm dev` mantém essa conta sincronizada sozinho, apenas durante o dia de aulas de cada criança. `pnpm sync:plan` mostra o que o planeador faria agora (a janela de hoje de cada criança, o que está à espera, se uma execução começaria) sem iniciar sessão em lado nenhum.

### Num telemóvel na rede de casa

```bash
pnpm dev:lan                    # like pnpm dev, and the app also listens on the local network
```

O Vite imprime um endereço `Network:` como `http://192.168.1.20:5173`; abra-o num telemóvel ligado à mesma rede Wi-Fi. Tudo passa por essa única porta: o servidor da aplicação encaminha `/api` para a API, que por sua vez só escuta em `127.0.0.1`, por isso o início de sessão funciona sem configuração extra. No Windows, permita o Node.js em redes **privadas** quando a firewall perguntar e confirme que o perfil da rede Wi-Fi é Privado. Instalar a aplicação, o modo offline e o Web Push precisam de HTTPS num telemóvel; isso chega com a etapa da PWA (`docs/build-plan.md` M8).

`pnpm smoke:lan` verifica a API tal como um telemóvel a vê, sem telemóvel: enquanto `pnpm dev:lan` está a correr, encontra o endereço deste computador na rede de casa, inicia sessão em `http://<address>:5173/api` com `MARKSY_DEV_EMAIL` e `MARKSY_DEV_PASSWORD` do `.env` e lê os dados de cada criança. Imprime estados, contagens e a forma de cada resposta (chaves e tipos, sem valores) e falha quando uma resposta contém uma palavra-passe ou o token de sessão, ou quando o cookie de sessão não funcionaria em http simples. `--host <ip>` permite escolher o endereço.

`pnpm smoke:ui` faz o mesmo para os ecrãs: com `pnpm dev:lan` a correr, abre a aplicação pelo endereço da rede de casa num navegador sem interface, no tamanho de um telemóvel (360 px, tátil) e de um tablet, inicia sessão com a conta de demonstração de responsável (e com a sua, quando `MARKSY_DEV_EMAIL` está definida), percorre todos os ecrãs de cada criança e capta os mesmos estados do protótipo clicável (`docs/mockups.html`) para comparação. As capturas de ecrã ficam em `data/ui/` (as três últimas execuções), que nunca vai para o repositório. Precisa do Chromium para o Playwright uma vez: `pnpm exec playwright install chromium`.

## Configuração

Em desenvolvimento, toda a configuração está no `.env` (criado por `pnpm setup:env` a partir de `env.example`); um servidor de produção tem o seu próprio `.env.production` ([docs/running.md](docs/running.md), secção 3). Os segredos nunca vão para o repositório.

| Variável | Finalidade |
|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | PostgreSQL para a aplicação (`marksy`, porta 5432, guardada num volume do Docker) e para `pnpm test` (`marksy_test` num servidor separado em memória, porta 5434, vazio após cada reinício) |
| `PORT`, `HOST` | Porta da API (3000) e endereço de escuta (`127.0.0.1`; os outros dispositivos chegam à API através do servidor da aplicação) |
| `SESSION_SECRET` | Cadeia aleatória para os cookies de sessão (gerada) |
| `CREDENTIALS_KEY` | Chave de 32 bytes (base64) que encripta as palavras-passe da caderneta guardadas (gerada) |
| `SYNC_ENABLED` | `true` na máquina que comunica com a caderneta, `false` numa cópia que só serve a API |
| `SYNC_WINDOW` | Opcional: um limite exterior para a janela do dia de aulas de cada criança (só a pode estreitar) |
| `SYNC_JITTER_MIN`, `SYNC_MIN_LOGIN_INTERVAL` | Atraso aleatório das execuções agendadas; tempo mínimo entre inícios de sessão por conta (só pode ser aumentado) |
| `SYNC_TICK_MIN`, `SYNC_CATCHUP_AFTER`, `SYNC_MAX_REQUESTS_PER_RUN` | Planeador: com que frequência decide, quando é permitida uma execução de recuperação, quanto pode obter uma execução |
| `SYNC_FAILURES_BEFORE_PAUSE`, `SYNC_PAUSE_HOURS`, `SYNC_PAUSE_MAX_HOURS`, `SYNC_OFFLINE_RETRY_MIN` | Tratamento de falhas: falhas antes de uma pausa, a pausa (que duplica até uma semana), nova tentativa quando esta máquina está sem ligação |
| `RETENTION_*` | Durante quanto tempo são guardados os dados operacionais (registo de sincronização, respostas em bruto, fluxos de eventos, cobertura) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Chaves de Web Push |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Bot do Telegram (opcional) |
| `MARKSY_ENV`, `DEV_MIN_LOGIN_INTERVAL_MINUTES` | Limites dos comandos manuais da caderneta (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`). `development` (definido em `env.example`): um início de sessão por conta a cada 10 minutos ou mais, a qualquer hora. Qualquer outro valor, incluindo a sua ausência, e qualquer build com `NODE_ENV=production`: o intervalo próprio do sistema de caderneta (uma hora na maioria). `pnpm env:dev` acrescenta as duas linhas de desenvolvimento a um `.env` antigo que não as tenha, sem mexer em valores já definidos. As sincronizações agendadas seguem as regras do dia de aulas em ambos os casos |
| `MARKSY_RUNNER` | Deixe vazia. `.claude/settings.json` define-a como `claude` para o Claude Code: em produção, os seus inícios de sessão reais estão limitados a três por dia, em horário escolar |
| `DIARY_LOGIN`, `DIARY_PASSWORD`, `MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD` | Só para desenvolvimento: a sua própria conta da caderneta para `pnpm probe`, `pnpm sync:once` e `pnpm dev:connect`, e a conta do Marksy que `dev:connect` cria. A aplicação em si guarda as credenciais da caderneta na base de dados, encriptadas |
| `TZ` | Fuso horário da escola (nome IANA) |

## Estrutura do repositório

```
packages/core/          common types, provider interface, grading scales, marks math,
                        guidance rules, throttled HTTP client, provider conformance suite
packages/i18n/          interface languages: en.json as the source of truth, ru reviewed, ten machine translations
packages/registry/      the list of providers the app offers
providers/_template/    starting point for a new provider
providers/demo-minimal/ a fictional diary with the fewest features, served from fixtures
providers/demo-full/    a fictional diary with many features: the demo family and the collector tests use it
providers/demo-lite/    the same fictional diary with fewer features: the demo family's second school
packages/demo-diary/    the fictional diary and school behind the demo providers and the demo family
providers/<id>/         one folder per diary system: manifest, schemas, mapper, fixtures
server/                 Express API, collector, backups, Drizzle schema and migrations, the production command line
web/                    React + Vite PWA, Tailwind driven by docs/tokens.json
updater/                automatic updates: channels, signature checks, rollback, the Docker socket guard
docker/                 the reverse proxy's and the web server's configuration
scripts/                checks (privacy, language, documentation, migrations, commits), releases, .env setup
docs/                   running.md         running Marksy at home
                        adding-a-diary.md  what connecting another diary system takes
                        ux-principles.md   why the interface is the way it is
                        design.md          product and technical design
                        build-plan.md      milestones and how the project is built
                        providers.md       the provider contract
                        i18n.md            how to add a language
                        api-spec.md        notes on the first provider's API
                        tokens.json        design tokens
                        mockups.html       clickable prototype
```

Comece por `docs/running.md` para pôr o Marksy a funcionar, `docs/ux-principles.md` para ver porque é que a interface é como é, `docs/design.md` para compreender ou alterar o produto e `docs/adding-a-diary.md` para ligar outro sistema de caderneta.

## Plano

O plano completo com os critérios de aceitação está em [`docs/build-plan.md`](docs/build-plan.md).

Feito:

1. Núcleo: modelo comum, escalas de classificação, cálculo de notas, cliente HTTP, línguas.
2. O primeiro fornecedor e os seus testes de conformidade.
3. Servidor: base de dados, coletor, planeador, dados de exemplo fictícios.
4. Contas, famílias, convites e a API de leitura.
5. A aplicação: início, atenção, notas, notas finais, disciplinas, página da disciplina, horário, definições, aspeto; depois, as traduções para as outras dez línguas.
6. Funcionamento em casa (1.0): imagens de produção, cópias de segurança, acesso remoto, atualizações automáticas assinadas.

A seguir:

7. Etiquetas.
8. Tempo de estudo.
9. PWA instalável com modo offline.
10. Notificações: caixa de entrada, regras, Web Push, Telegram.

## Contribuir

Não são aceites pull requests. Relatórios de erros, ideias e correções de tradução, da aplicação ou desta página na sua língua, são muito bem-vindos como [Issues](https://github.com/Dopetast1c/Marksy/issues), em inglês ou em russo.

Se a API de uma caderneta mudar, abra uma issue com uma resposta limpa (nomes, ids e comentários substituídos), o id do fornecedor e a data.

O projeto é construído com o Claude Code seguindo `docs/build-plan.md`; as skills e os agentes que usa estão em `.claude/`, e as regras que o código segue estão em `CLAUDE.md`. Se alterar o Marksy para o seu próprio uso não comercial, `docs/providers.md` explica como acrescentar um sistema de caderneta e `docs/i18n.md` como acrescentar uma língua.

## Aviso legal

O Marksy é um projeto independente de código disponível. Não está associado a nenhuma escola, autoridade educativa ou fornecedor de cadernetas, nem é apoiado ou suportado por eles. Usa a API de uma caderneta em nome de quem lá tem conta (responsável ou estudante), apenas lê dados e destina-se à sua própria família.

## Licença

O Marksy está licenciado ao abrigo da [PolyForm Noncommercial License 1.0.0](LICENSE).

**Pode** usá-lo, copiá-lo e alterá-lo para qualquer fim não comercial: em casa, para a sua própria família, para estudo, investigação, projetos pessoais e testes, e em escolas, outras instituições de ensino, instituições de solidariedade, organismos públicos de investigação e instituições do Estado.

**Não pode** usá-lo comercialmente: nada de o vender, nada de alojamento pago ou serviço pago baseado nele, nada de o incluir num produto pago, e nenhuma utilização por uma empresa para os seus próprios fins.

Se precisar de uma licença comercial, peça-a através de uma [issue](https://github.com/Dopetast1c/Marksy/issues). O que conta é o [texto completo da licença](LICENSE); este resumo é apenas um guia.
