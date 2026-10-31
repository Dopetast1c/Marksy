<!-- source: README.md sha256:7a71e523a772 · machine -->
[English](README.md) · [Русский](README.ru.md) · [Беларуская](README.be.md) · [Українська](README.uk.md) · [Қазақша](README.kk.md) · [Polski](README.pl.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · **Français** · [Nederlands](README.nl.md) · [Română](README.ro.md)

> Cette page est une traduction automatique du README anglais, qui reste le texte de référence. Les corrections sont les bienvenues via le formulaire [Traduction de la documentation](https://github.com/Dopetast1c/Marksy/issues/new?template=docs-translation.yml).

# Marksy

**L’année scolaire de vos enfants, en un seul endroit, calme et clair.**

Marksy est une application familiale pour les notes scolaires, au code source consultable et gratuite pour un usage personnel ou tout autre usage non commercial. Elle se connecte au carnet numérique que votre école utilise déjà, lit les notes, l’emploi du temps et les devoirs via l’API du carnet lui-même, et construit par-dessus une couche plus riche : moyennes et évolutions pour chaque matière et chaque période, historique complet de chaque note, programme des jours à venir, minuteur d’étude, notifications et identifiants séparés pour chaque parent et chaque enfant. Elle fonctionne sur votre propre ordinateur, s’installe comme une application sur n’importe quel téléphone et parle douze langues.

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)
![PWA](https://img.shields.io/badge/app-PWA-5a0fc8.svg)
![Self-hosted](https://img.shields.io/badge/data-self--hosted-2f7a4a.svg)

> **Statut : 1.0, la première version.** Les notes, les notes finales, les matières, le planning avec les devoirs, la famille et l’apparence de l’application fonctionnent et servent tous les jours, à la maison, sur un ordinateur qui se met à jour tout seul. Les étiquettes, le temps d’étude, l’application installable avec mode hors ligne et les notifications arrivent ensuite, dans cet ordre ([`docs/build-plan.md`](docs/build-plan.md)). Les sections ci-dessous décrivent le produit complet.

## L’idée

Le carnet scolaire est la source de vérité : les enseignants y inscrivent chaque jour les notes, les thèmes des cours, les devoirs et l’emploi du temps, et le carnet les met à disposition via son API. Cela représente beaucoup de données précieuses, et une grande partie de leur valeur apparaît avec le temps et d’une matière à l’autre : comment se passe une matière ce trimestre, ce qui a changé depuis hier, quel contrôle tombe mardi, si cette semaine s’est mieux passée que la précédente.

Marksy reprend ces données et les enrichit pour la famille :

- **Elle se souvient.** Chaque note est conservée avec son historique complet : la famille voit non seulement où en sont les choses, mais aussi comment on en est arrivé là, y compris les notes corrigées après coup.
- **Elle résume.** Les moyennes par matière sur une semaine, un mois, un trimestre ou une année, comparées à la période précédente, avec la répartition des notes et une évolution.
- **Elle anticipe.** Les cours du lendemain avec leurs devoirs, les contrôles à venir et ce qu’il faut apprendre par cœur, signalés plusieurs jours à l’avance.
- **Elle rassemble la famille.** Un seul compte du carnet sert à toute la famille ; chaque parent et chaque enfant a son propre identifiant, ses propres notifications et sa propre vue.
- **Elle voyage.** Le système de carnet est un module enfichable. Tout le reste, chaque écran et chaque chiffre, est commun : un nouveau pays, une nouvelle région ou une nouvelle école obtient toute l’application en ajoutant un petit fournisseur.

## Ce que vous obtenez

### Accueil

La journée en un coup d’œil. Deux chiffres pour la période choisie, la moyenne et le nombre de notes, chacun avec sa valeur de la période précédente. Puis les notes du jour, le temps d’étude, le bloc **Attention** (les quelques points qui méritent un regard maintenant : une note basse, un contrôle qui approche, une moyenne qui baisse, quelque chose à apporter demain) et les cours du lendemain avec leurs devoirs. En dessous, les statistiques : les notes par niveau, la répartition par valeur et une évolution par semaine, mois, trimestre ou année.

Chaque écran avec des chiffres a le même sélecteur de période : choisissez une semaine, un mois, un trimestre ou une année, puis revenez à n’importe quelle période antérieure avec les flèches, un balayage ou une liste.

### Notes

Toutes les notes dans un seul fil, groupées par jour, avec la matière, le type de travail, le thème du cours et le commentaire qui l’accompagne. Filtrez par étiquettes comme « Contrôle » ou « Poésie », une ou plusieurs à la fois. En un toucher, les **notes finales** : un tableau des résultats de chaque trimestre et de l’année pour chaque matière, où un trimestre encore en cours affiche sa moyenne actuelle, pour qu’une tendance ne soit jamais prise pour un résultat final.

### Matières

Toutes les matières de l’enfant, toujours : la moyenne de la période, le sens dans lequel elle évolue, sa valeur précédente et les dernières notes. Triez par ordre alphabétique, des plus faibles aux plus fortes ou l’inverse, ou par plus forte hausse ou baisse. Dans les classes où l’on ne note pas encore, la même liste montre à la place les cours, les devoirs et le temps d’étude.

### Une matière en détail

Chaque matière a sa propre page, teintée de sa couleur : l’objectif du trimestre (« pour un 8, il faut deux 9 ou un 10 »), les points qui méritent attention, les statistiques et l’évolution, chaque note avec son commentaire, les prochains cours, les résultats trimestre par trimestre et le temps d’étude.

### Planning et devoirs

Un jour ou une semaine entière, en arrière comme en avant, une ligne par cours avec l’heure, la salle, le thème, les devoirs et la note obtenue à ce cours ; avant un cours, la moyenne de la matière et les dernières notes juste en dessous. Les cours qu’un enfant a préparés reçoivent une coche **Fait** visible par toute la famille. Les familles peuvent ajouter leurs propres devoirs et indiquer qu’un cours n’aura pas lieu. Les trous dans la journée apparaissent comme des trous : un début tardif se voit tout de suite.

### Étiquettes

Dites à Marksy ce qui compte, avec les mots de votre école : une poésie à apprendre, un contrôle, quelque chose à apporter. Une étiquette, ce sont quelques mots-clés que Marksy cherche dans les thèmes des cours et dans les devoirs. Les cours étiquetés sont mis en évidence dans le planning et apparaissent sur l’écran d’accueil plusieurs jours à l’avance, avec les mots exacts qui ont été trouvés. Des étiquettes toutes prêtes sont fournies avec chaque langue et se modifient librement.

### Temps d’étude

Un minuteur pour les devoirs, lancé depuis un cours ou une matière, avec pause et fin, et une petite barre qui reste à l’écran tant qu’il tourne. Terminer une séance et marquer un cours comme fait sont deux gestes distincts, car une pause n’est pas la fin. Quand le minuteur n’a pas servi, Marksy estime le temps à partir des coches « fait » de la soirée et présente l’estimation comme telle. Le temps est affiché par jour et par matière, simplement, sans jugement.

### Notifications

Une notification push sur le téléphone ou un message Telegram quand quelque chose se passe : une nouvelle note, une note sous un seuil choisi, une note corrigée, une absence, un contrôle qui approche, un récapitulatif des devoirs le soir, un résumé de la semaine. Chaque règle se règle par personne, avec des heures calmes. Tout ce qui a été envoyé reste dans une boîte de réception de l’application : une notification balayée n’est jamais perdue.

### Famille

La famille connecte le carnet une seule fois. Chaque membre reçoit son propre identifiant Marksy par invitation : l’autre parent, les grands-parents, chaque enfant. Les enfants n’ont jamais besoin du mot de passe du carnet. Des amis peuvent créer leur propre famille sur le même serveur ; les familles ne voient jamais les données les unes des autres.

### Votre style, votre langue

Thèmes clair et sombre, palettes de couleurs, fonds d’écran, cinq polices de texte, une couleur pour chaque matière. Douze langues d’interface : russe, biélorusse, ukrainien, kazakh, anglais, polonais, allemand, espagnol, portugais, français, néerlandais et roumain, au choix de chaque personne. L’anglais et le russe sont relus par des personnes ; les dix autres sont des traductions automatiques, signalées comme telles dans l’application, qui renvoie vers un court formulaire pour les corrections. Ajouter une langue, c’est un seul fichier JSON ([`docs/i18n.md`](docs/i18n.md)).

## À voir tout de suite

Ouvrez [`docs/mockups.html`](docs/mockups.html) dans un navigateur. C’est un prototype cliquable, pensé d’abord pour le mobile, de chaque écran avec des données fictives : passez d’un parent à un enfant, d’un enfant à l’autre, du clair au sombre. L’application est construite pour lui correspondre.

## Comment ça marche

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

- **Fournisseur.** Un petit module par système de carnet. Il se connecte avec les identifiants de la famille et renvoie les élèves, les trimestres, les matières, les cours avec notes et devoirs, et les notes finales dans le format commun de Marksy. Il déclare ce que son système propose (types de cours, commentaires, présences, trimestres, emploi du temps à venir) et son barème de notation, et l’application s’adapte exactement à cela.
- **Collecteur.** Le même pour tous les fournisseurs. Quelques fois pendant la journée d’école, il récupère les semaines récentes de chaque enfant, détecte les notes nouvelles, modifiées et supprimées, garde l’historique de chaque changement et relit tout le trimestre une fois par semaine, car les enseignants modifient parfois des notes plus anciennes. Il fonctionne comme un planificateur : si l’ordinateur est resté éteint un week-end, la première exécution suivante rattrape ce qui a été manqué.
- **API.** Fournit les données enregistrées à l’application, limitées à une famille, et se documente elle-même avec OpenAPI sur `/api/docs`.
- **Application.** Une PWA React avec une coque hors ligne, installable sur iOS et Android, testée sur de vrais téléphones via le réseau domestique dès les premiers écrans.

## N’importe quelle école, n’importe quel barème

Marksy repose sur un modèle commun (élèves, trimestres, matières, cours, notes, notes finales) et sur une description du **barème de notation** fournie par le fournisseur : l’étendue et le sens, quatre niveaux de qualité, des seuils, des objectifs, la façon de calculer et d’afficher les moyennes, d’arrondir les notes finales. Un barème sur 10, sur 5 ou sur 12, de 1 à 6 où 1 est la meilleure note, de 0 à 20, des lettres avec GPA, des pourcentages, réussi ou non réussi : les mêmes écrans, moyennes, filtres, objectifs et conseils fonctionnent pour chacun, même quand le barème change d’une année scolaire ou d’une matière à l’autre.

Tout ce qu’un carnet peut avoir ou non est facultatif : types de cours, catégories de notes, commentaires, présences, trimestres, notes finales officielles, et même l’emploi du temps. Un fournisseur déclare ce qui existe, et chaque écran montre ce qui est là au lieu de colonnes vides.

Pour connecter un nouveau système, on écrit un fournisseur : un manifeste (identifiants, barème, capacités, limites de débit), une fonction de connexion, quelques fonctions de récupération qui convertissent les réponses vers les types communs, une fonction `sanitize()` pour les données de test, et le test de conformité partagé. [`docs/adding-a-diary.md`](docs/adding-a-diary.md) explique ce que cela demande et comment demander le système de votre école ; le contrat complet et une liste de vérification sont dans [`docs/providers.md`](docs/providers.md), et `providers/_template` est un point de départ qui compile.

## Respectueux par conception

- **Lecture seule.** Marksy ne fait que lire. Le client HTTP partagé refuse toute requête hors de la liste autorisée du fournisseur : rien dans le carnet ne peut être modifié par accident.
- **Doux.** Au plus une connexion par heure et par compte, une requête à la fois avec des pauses, un ralentissement en cas d’erreur, un plafond par exécution. L’actualisation manuelle partage le même budget.
- **Résilient.** Chaque tentative et chaque semaine vérifiée sont enregistrées. Les pannes d’un côté comme de l’autre sont rattrapées automatiquement ; après des échecs répétés, la synchronisation se met en pause et l’admin de la famille reçoit un seul message. Un mauvais mot de passe arrête la synchronisation jusqu’à sa correction, pour que le vrai compte ne soit jamais bloqué.
- **Attentif au réseau.** Certains systèmes de carnet répondent mieux depuis leur propre région ou sans VPN. Chaque fournisseur déclare ses besoins réseau, et le collecteur tourne sur une machine à la maison qui y répond : un PC, un mini-PC, un Raspberry Pi, un NAS.
- **Ordonné.** Les notes et leur historique sont conservés tant que l’enfant fait partie de la famille ; les données d’exploitation (journaux de synchronisation, réponses brutes, flux d’événements) sont gardées quelques semaines ou quelques mois, puis compactées. Les limites sont dans `env.example`, sous `RETENTION_*`.

## Confidentialité

Marksy traite des données sur des enfants, et ses réglages par défaut en tiennent compte.

- **Vos données restent chez vous.** Pas d’analytique, pas de scripts ni de polices tiers, rien ne quitte votre serveur.
- **Des sessions partout.** Chaque route, sauf la connexion, l’état de santé et la documentation de l’API, exige une session, et chaque requête est limitée à une famille.
- **Secrets protégés.** Les mots de passe du carnet sont chiffrés au repos (AES-256-GCM) ; les mots de passe Marksy sont hachés avec argon2id. Les journaux ne contiennent jamais de mots de passe, de jetons ni de noms complets.
- **Rien de réel dans le dépôt.** Les données de test sont fictives ou nettoyées ; `pnpm privacy` recherche les secrets, les données personnelles et les fichiers qui ne doivent jamais être commités.
- **Les familles possèdent leurs données.** Une famille peut tout exporter en JSON et s’effacer complètement ; la durée de conservation est un réglage. Si vous hébergez Marksy pour d’autres familles, lisez d’abord la section 14.1 de `docs/design.md`.

## Prérequis

- Un compte sur un carnet scolaire pris en charge (celui d’un parent ou d’un élève).
- Un ordinateur allumé pendant la journée d’école, avec Docker et rien d’autre : un PC ou un portable à la maison, un mini-PC, un Raspberry Pi ou un NAS.
- En option : un domaine sur Cloudflare, pour utiliser l’application hors du réseau domestique via Cloudflare Tunnel, l’installer sur les téléphones et recevoir les Web Push ; un jeton de bot Telegram pour les notifications Telegram.
- Pour développer Marksy : Node.js 22, pnpm et Docker.

## Mise en production

Pour faire tourner Marksy chaque jour pour votre famille, sur un portable, un Raspberry Pi ou un NAS, avec seulement Docker sur cet ordinateur : [docs/running.md](docs/running.md). Ce guide couvre l’installation, les façons d’accéder à l’application à la maison et de l’extérieur (Cloudflare Tunnel), les sauvegardes, la restauration et le passage à un autre ordinateur, ainsi que les mises à jour. Chaque version est accompagnée des fichiers dont un hôte a besoin, joints sous le nom `marksy-deploy-vX.Y.Z.zip`.

Les versions sont numérotées MAJOR.MINOR.PATCH : MAJOR est une refonte globale de l’application (rare), MINOR apporte de nouvelles fonctions, PATCH des corrections. Un hôte installe les nouvelles versions de lui-même, en quelques minutes, après avoir vérifié qu’elles ont bien été signées par ce projet, avec une sauvegarde avant et un retour possible en cas de problème.

## Démarrage rapide pour le développement

L’espace de travail fait tourner toute l’application à partir du code source : la base de données, le collecteur et son planificateur, l’API et sa documentation, l’application, et une famille de démonstration fictive pour tout explorer sans compte de carnet. Il vous faut Node.js 22, pnpm (`npm install -g pnpm` ou `corepack enable`) et Docker.

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

La famille de démonstration appartient à un carnet fictif et compte deux enfants, dont un dans une classe sans notes : chaque écran peut donc être exploré sans compte de carnet ; ses identifiants (`parent@example.com` et `student@example.com`, mot de passe affiché par `pnpm db:seed`) fonctionnent dès que la connexion est disponible. Comme ce mot de passe est public, le seed refuse de s’exécuter quand `PUBLIC_URL` est une adresse publique (`--allow-public` passe outre). `pnpm db:studio` ouvre la base de données dans Drizzle Studio. `pnpm db:backup` écrit une copie de la base locale dans `data/backups/` (les cinq dernières sont gardées) et la vérifie en la restaurant dans une base temporaire ; `pnpm db:restore <file> --yes` en remet une en place. Avec un compte de carnet, ouvrez l’application, choisissez « Connecter un carnet », sélectionnez votre système de carnet et connectez-vous : Marksy vérifie une fois les identifiants, crée votre famille et lance la première synchronisation. Invitez le reste de la famille depuis Plus, puis Famille.

Avec un compte de carnet, `pnpm dev:connect` met en place votre propre famille depuis la ligne de commande : il lit l’identifiant du carnet (`DIARY_LOGIN`, `DIARY_PASSWORD`) et l’identifiant Marksy souhaité (`MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD`) dans `.env` et exécute le même code que « Connecter un carnet » ; relancé après une réinitialisation de la base, il n’ajoute que ce qui manque, et après `pnpm sync:once` il reprend cette famille sans se reconnecter au carnet. Avant cela, il est possible de remplir la base locale depuis la ligne de commande : mettez l’identifiant du carnet dans `DIARY_LOGIN` et `DIARY_PASSWORD` de `.env` et lancez `pnpm sync:once`. Cette commande ne s’adresse qu’aux systèmes de carnet proposés aux familles, crée une famille minimale à la première utilisation et lance une synchronisation selon les mêmes règles que toutes les autres (le plafond de requêtes, la vérification hors ligne, une connexion par compte et par intervalle : 10 minutes pour les commandes manuelles en développement, l’intervalle propre au système de carnet en production) ; `pnpm probe` lit chaque point d’accès une fois et actualise les données de test nettoyées du fournisseur, et `pnpm probe --offline` refait les vérifications sur les réponses enregistrées sans se connecter (il ne réécrit les données de test qu’avec `--write-fixtures`). Les trois commandes qui se connectent à un vrai carnet partagent une garde de connexion. La garde de pré-commit refuse un commit qui contient des données locales, des secrets, des dumps de base de données ou des réponses brutes, ou tout nom ou identifiant tiré des dernières réponses réelles. `pnpm sync:once` n’affiche que des nombres et des statuts, et se termine avec 0 même quand les règles retiennent l’exécution. Tant que `SYNC_ENABLED` vaut `true`, `pnpm dev` garde ce compte synchronisé de lui-même, uniquement pendant la journée d’école de chaque enfant. `pnpm sync:plan` montre ce que le planificateur ferait maintenant (la plage de chaque enfant aujourd’hui, ce qui attend, si une exécution démarrerait) sans se connecter nulle part.

### Sur un téléphone du réseau domestique

```bash
pnpm dev:lan                    # like pnpm dev, and the app also listens on the local network
```

Vite affiche une adresse `Network:` comme `http://192.168.1.20:5173` ; ouvrez-la sur un téléphone connecté au même Wi-Fi. Tout passe par ce seul port : le serveur de l’application transmet `/api` à l’API, qui elle-même n’écoute que sur `127.0.0.1`, donc la connexion fonctionne sans réglage supplémentaire. Sous Windows, autorisez Node.js sur les réseaux **privés** quand le pare-feu le demande et vérifiez que le profil Wi-Fi est Privé. L’installation de l’application, le mode hors ligne et Web Push exigent HTTPS sur un téléphone ; cela arrive avec le jalon PWA (`docs/build-plan.md` M8).

`pnpm smoke:lan` vérifie l’API telle qu’un téléphone la voit, sans téléphone : pendant que `pnpm dev:lan` tourne, il trouve l’adresse de cet ordinateur sur le réseau domestique, se connecte sur `http://<address>:5173/api` avec `MARKSY_DEV_EMAIL` et `MARKSY_DEV_PASSWORD` de `.env`, et lit les données de chaque enfant. Il affiche les statuts, les nombres et la forme de chaque réponse (clés et types, sans valeurs) et échoue quand une réponse contient un mot de passe ou le jeton de session, ou quand le cookie de session ne fonctionnerait pas en http simple. `--host <ip>` permet de choisir l’adresse soi-même.

`pnpm smoke:ui` fait de même pour les écrans : avec `pnpm dev:lan` en cours, il ouvre l’application via l’adresse du réseau domestique dans un navigateur sans interface, à la taille d’un téléphone (360 px, tactile) et à celle d’une tablette, se connecte avec le parent de démonstration (et avec votre compte quand `MARKSY_DEV_EMAIL` est défini), parcourt chaque écran de chaque enfant et capture les mêmes états du prototype cliquable (`docs/mockups.html`) pour comparaison. Les captures d’écran arrivent dans `data/ui/` (les trois dernières exécutions), qui n’est jamais commité. Il faut installer une fois Chromium pour Playwright : `pnpm exec playwright install chromium`.

## Configuration

Pour le développement, toute la configuration est dans `.env` (créé par `pnpm setup:env` à partir de `env.example`) ; un hôte de production a son propre `.env.production` ([docs/running.md](docs/running.md), section 3). Les secrets ne vont jamais dans le dépôt.

| Variable | Rôle |
|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | PostgreSQL pour l’application (`marksy`, port 5432, conservé dans un volume Docker) et pour `pnpm test` (`marksy_test` sur un serveur en mémoire séparé, port 5434, vide après chaque redémarrage) |
| `PORT`, `HOST` | Port de l’API (3000) et adresse d’écoute (`127.0.0.1` ; les autres appareils atteignent l’API via le serveur de l’application) |
| `SESSION_SECRET` | Chaîne aléatoire pour les cookies de session (générée) |
| `CREDENTIALS_KEY` | Clé de 32 octets (base64) qui chiffre au repos les mots de passe du carnet (générée) |
| `SYNC_ENABLED` | `true` sur la machine qui communique avec le carnet, `false` sur une copie limitée à l’API |
| `SYNC_WINDOW` | Facultatif : une limite extérieure à la plage de la journée d’école de chaque enfant (elle ne peut que la réduire) |
| `SYNC_JITTER_MIN`, `SYNC_MIN_LOGIN_INTERVAL` | Délai aléatoire des exécutions planifiées ; temps minimal entre deux connexions par compte (ne peut qu’être augmenté) |
| `SYNC_TICK_MIN`, `SYNC_CATCHUP_AFTER`, `SYNC_MAX_REQUESTS_PER_RUN` | Planificateur : à quelle fréquence il décide, quand une exécution de rattrapage est permise, combien une exécution peut récupérer |
| `SYNC_FAILURES_BEFORE_PAUSE`, `SYNC_PAUSE_HOURS`, `SYNC_PAUSE_MAX_HOURS`, `SYNC_OFFLINE_RETRY_MIN` | Gestion des échecs : nombre d’échecs avant une pause, la pause (doublée jusqu’à une semaine), nouvel essai quand cette machine est hors ligne |
| `RETENTION_*` | Durée de conservation des données d’exploitation (journal de synchronisation, réponses brutes, flux d’événements, couverture) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Clés Web Push |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Bot Telegram (facultatif) |
| `MARKSY_ENV`, `DEV_MIN_LOGIN_INTERVAL_MINUTES` | Limites des commandes manuelles du carnet (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`). `development` (défini dans `env.example`) : une connexion par compte toutes les 10 minutes ou plus, à toute heure. Toute autre valeur, y compris une valeur absente, et tout build avec `NODE_ENV=production` : l’intervalle propre au système de carnet (une heure pour la plupart). `pnpm env:dev` ajoute les deux lignes de développement à un ancien `.env` qui ne les a pas, sans toucher aux valeurs déjà définies. Les synchronisations planifiées suivent les règles de la journée d’école dans les deux cas |
| `MARKSY_RUNNER` | À laisser vide. Défini à `claude` pour Claude Code par `.claude/settings.json` : en production, ses vraies connexions sont limitées à trois par jour pendant les heures de cours |
| `DIARY_LOGIN`, `DIARY_PASSWORD`, `MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD` | Développement uniquement : votre propre identifiant de carnet pour `pnpm probe`, `pnpm sync:once` et `pnpm dev:connect`, et l’identifiant Marksy que crée `dev:connect`. L’application elle-même garde les identifiants du carnet dans la base de données, chiffrés |
| `TZ` | Fuseau horaire de l’école (nom IANA) |

## Organisation du dépôt

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

Commencez par `docs/running.md` pour faire tourner Marksy, `docs/ux-principles.md` pour comprendre pourquoi l’interface est ainsi, `docs/design.md` pour comprendre ou modifier le produit, et `docs/adding-a-diary.md` pour connecter un autre système de carnet.

## Feuille de route

Le plan complet, avec les critères d’acceptation, est dans [`docs/build-plan.md`](docs/build-plan.md).

Terminé :

1. Le cœur : modèle commun, barèmes de notation, calcul des notes, client HTTP, langues.
2. Le premier fournisseur et ses tests de conformité.
3. Le serveur : base de données, collecteur, planificateur, données de démonstration fictives.
4. Comptes, familles, invitations et API de lecture.
5. L’application : accueil, Attention, notes, notes finales, matières, page d’une matière, planning, réglages, apparence ; puis les traductions dans les dix autres langues.
6. Le fonctionnement à la maison (1.0) : images de production, sauvegardes, accès à distance, mises à jour automatiques signées.

À venir :

7. Étiquettes.
8. Temps d’étude.
9. PWA installable avec mode hors ligne.
10. Notifications : boîte de réception, règles, Web Push, Telegram.

## Contribuer

Les pull requests ne sont pas acceptées. Les signalements de bugs, les idées et les corrections de traduction, de l’application ou de cette page dans votre langue, sont les bienvenus sous forme d’[Issues](https://github.com/Dopetast1c/Marksy/issues), en anglais ou en russe.

Si l’API d’un carnet change, ouvrez une issue avec une réponse nettoyée (noms, identifiants et commentaires remplacés), l’identifiant du fournisseur et la date.

Le projet est construit avec Claude Code en suivant `docs/build-plan.md` ; les skills et les agents qu’il utilise sont dans `.claude/`, et les règles que suit le code sont dans `CLAUDE.md`. Si vous modifiez Marksy pour votre propre usage non commercial, `docs/providers.md` explique comment ajouter un système de carnet et `docs/i18n.md` comment ajouter une langue.

## Avertissement

Marksy est un projet indépendant, au code source consultable. Il n’est affilié à aucune école, autorité éducative ni éditeur de carnet, et n’est ni approuvé ni soutenu par eux. Il utilise l’API d’un carnet pour le compte d’un parent ou d’un élève qui y possède un compte, ne fait que lire des données et est destiné à votre propre famille.

## Licence

Marksy est distribué sous la [PolyForm Noncommercial License 1.0.0](LICENSE).

**Vous pouvez** l’utiliser, le copier et le modifier à toute fin non commerciale : à la maison pour votre propre famille, pour l’étude, la recherche, des projets personnels et des tests, ainsi que dans les écoles, les autres établissements d’enseignement, les associations caritatives, les organismes publics de recherche et les institutions publiques.

**Vous ne pouvez pas** l’utiliser à des fins commerciales : pas de vente, pas d’hébergement payant ni de service payant construit dessus, pas d’intégration dans un produit payant, et pas d’utilisation par une entreprise pour ses propres besoins.

Si vous avez besoin d’une licence commerciale, faites-en la demande via une [issue](https://github.com/Dopetast1c/Marksy/issues). Seul le [texte complet de la licence](LICENSE) fait foi ; ce résumé n’est qu’un guide.
