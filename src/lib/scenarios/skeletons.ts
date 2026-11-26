/**
 * Squelettes NEUTRES et valides pour la création d'un scénario. Ils ne copient
 * aucune marque réelle et servent de point de départ à l'éditeur comme aux tests.
 * Chacun respecte les invariants validés par `importBundle` :
 * - l'e-mail MJML compile et contient {{firstName}}, un bouton href="{{clickUrl}}"
 *   et le pixel d'ouverture {{openUrl}} ;
 * - la landing est « zéro capture » : formulaire vers {{submitUrl}}, aucun champ
 *   nommé, et le beacon littéral navigator.sendBeacon('{{beaconUrl}}') ;
 * - la page de sensibilisation contient {{awarenessMessage}}.
 */

/** Sujet neutre proposé par défaut. */
export const SKELETON_SUBJECT = 'Message de test {{firstName}}';

/** Gabarit e-mail MJML minimal et neutre. */
export const SKELETON_EMAIL = `<mjml>
	<mj-body>
		<mj-section>
			<mj-column>
				<mj-text>Bonjour {{firstName}},</mj-text>
				<mj-text>Ceci est un exercice de sensibilisation. Remplacez ce texte par le vôtre.</mj-text>
				<mj-button href="{{clickUrl}}">Ouvrir</mj-button>
			</mj-column>
		</mj-section>
		<mj-raw><img src="{{openUrl}}" width="1" height="1" alt="" style="display:none" /></mj-raw>
	</mj-body>
</mjml>
`;

/** Gabarit landing minimal, conforme à l'invariant « zéro capture ». */
export const SKELETON_LANDING = `<!doctype html>
<html lang="fr">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Page de test</title>
	</head>
	<body>
		<h1>Bonjour {{firstName}}</h1>
		<p>Remplacez cette page par la vôtre. Aucun champ n'est lu ni stocké.</p>
		<form action="{{submitUrl}}" method="post" autocomplete="off" novalidate>
			<label>Identifiant <input type="text" autocomplete="off" /></label>
			<label>Mot de passe <input type="password" autocomplete="off" /></label>
			<button type="submit">Continuer</button>
		</form>
		<script>
			try {
				navigator.sendBeacon('{{beaconUrl}}');
			} catch (e) {
				try {
					fetch('{{beaconUrl}}', { method: 'POST', keepalive: true });
				} catch (e2) {
					/* repli silencieux : seul l'affichage est signalé */
				}
			}
		</script>
	</body>
</html>
`;

/**
 * Gabarit de pièce jointe HTML « zéro capture » : il ne fait que signaler son
 * OUVERTURE via le beacon {{attachmentOpen}} (comme le pixel d'ouverture de
 * l'e-mail). Aucun champ de formulaire n'est autorisé (cf. `validateAttachment`).
 */
export const SKELETON_ATTACHMENT_HTML = `<!doctype html>
<html lang="fr">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Document</title>
	</head>
	<body>
		<h1>Bonjour {{firstName}}</h1>
		<p>Ceci est un exercice de sensibilisation. Ouvrir une pièce jointe reçue par
			message peut suffire à déclencher une action : ne les ouvrez qu'en confiance.</p>
		<img src="{{attachmentOpen}}" width="1" height="1" alt="" style="display:none" />
	</body>
</html>
`;

/** Gabarit page de sensibilisation minimal et neutre. */
export const SKELETON_AWARENESS = `<!doctype html>
<html lang="fr">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Sensibilisation</title>
	</head>
	<body>
		<h1>Bonjour {{firstName}}</h1>
		<div class="note">{{awarenessMessage}}</div>
	</body>
</html>
`;
