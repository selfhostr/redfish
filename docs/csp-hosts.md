# CSP et isolation des hôtes

- `DASHBOARD_HOST` / `TRACKING_HOST` : quand les deux sont définis, `/t/*` n'est
  servi que sur l'hôte de tracking et l'app opérateur que sur l'hôte dashboard ;
  toute requête croisée ou d'hôte inconnu reçoit un 404. `/_app/`, `/health` et
  `/favicon.ico` sont servis sur les deux. Si l'une est vide (dev), tout est permis.
- CSP : `default-src 'self'`, aucune origine externe, `script-src 'self'` + nonce
  par réponse (posé sur les `<script>` inline, dont le beacon de la page
  d'atterrissage) ; jamais `'unsafe-inline'` pour les scripts. Les styles inline
  restent permis (gabarits).
- Reverse proxy : ne pas journaliser les corps de requête (zéro capture), ni les
  en-têtes `Cookie`/`Authorization`. Il doit transmettre l'en-tête `Host` d'origine
  (ou configurer `HOST_HEADER` d'adapter-node).
