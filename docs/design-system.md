# Design system (UI de l'application)

Thème sombre unique. Définitions dans `src/app.css`, composants dans `src/lib/components/ui/` (import depuis `$lib/components/ui`).

## Tokens et utilitaires

Variables `--c-*` : `canvas`, `surface-1`, `surface-2`, `line`, `line-strong`, `ink`, `ink-dim`, `signal`, `advisory`, `warning`, `info`, leurs teintes `*-bg` (signal, advisory, warning, info), `on-ink`, `ink-hover`. Rayons `--r-flat|btn|card|box`. Polices `--font-ui`, `--font-mono`. Taille de base 13px, chiffres tabulaires sur tout le corps.

Utilitaires Tailwind : `bg-`, `text-`, `border-` + `canvas`, `surface-1`, `surface-2`, `line`, `line-strong`, `ink`, `ink-dim`, `signal`, `advisory`, `warning`, `info` (et `*-bg`, `on-ink`) ; `font-ui`, `font-mono`. Aucun hex en dur hors des définitions de tokens.

## Primitives

- `Button` : `variant` primary|secondary|ghost|danger, `size` sm|md, `href`, `type`, `disabled`.
- `Panel`, `Field`, `Tabs`, `Skeleton` (`width`, `height`, `radius`).
- `Plate` : `variant` signal|advisory|warning|info|neutral ; point + mot + couleur.
- `StatusPill` : `status` d'une campagne (draft, scheduled, sending, completed ; repli neutre).
- `EmptyState`, `ErrorNotice` : états vides et erreurs.
- `Toast` (monté une fois dans le layout) et `toast(message, kind?, durationMs?)` ; kind signal|advisory|warning|info. À appeler uniquement côté client (handlers, onMount, $effect), jamais en SSR ni dans un load : l'état est partagé entre requêtes.
- `LocalTime` : `value` (Date|string|number, UTC), `mode` datetime|date. UTC au rendu serveur, heure locale fr-CH avec fuseau abrégé (ex. « 20.11.26 17:07 UTC+1 ») après montage (title = UTC), « n/d » si vide.
- `CopyButton` : `value`, `what`, `label`, `size` ; copie et affiche un toast.
- `withParams(url, patch)` (`$lib/url-params`) : retourne pathname + search ; valeur vide, null ou undefined retire le paramètre. Ex. `<a href={withParams(page.url, { status: 'draft', page: null })}>`.

## Règles

- La couleur porte un sens, jamais de décoration. Un statut = point + mot + couleur.
- Un seul bouton primaire par vue, neutre (clair sur sombre).
- Une phrase d'introduction avant chaque bloc de données.
- Intitulés (titres de section de Panel, libellés de KPI et de champs, `<th>`) : `rf-eyebrow` ou `rf-label`, jamais de combinaison ad hoc `uppercase`/`tracking-wide`. Libellés de l'entonnoir : `$lib/funnel-labels`.
- Valeur vide : « n/d ».
- Toute heure passe par `LocalTime`. Tout identifiant ou URL à copier passe par `CopyButton`.
- Filtres reflétés dans l'URL via `withParams` (formulaires GET ou liens).
- Liste vide : `EmptyState`. Erreur : `ErrorNotice`.

## Interdits

Dégradé, emoji, tiret cadratin dans les textes affichés, hex en dur, attribut `name` sur les pages de destination.

## Hors thème

Pages publiques `/t/*`, e-mails MJML, rapport imprimable : styles propres, non couverts par ce système.
