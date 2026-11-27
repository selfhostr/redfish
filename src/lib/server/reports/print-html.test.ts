import { expect, test } from 'vitest';
import { renderReportHtml } from './print-html';
import type { ReportData } from './report';

/** Construit un ReportData complet, surchargé au besoin pour chaque cas. */
function makeReport(over: Partial<ReportData> = {}): ReportData {
	const base: ReportData = {
		campaignId: 'camp-1',
		campaignName: 'Campagne de test',
		anonymized: false,
		generatedAt: '2026-05-10T08:30:00.000Z',
		timezone: 'Europe/Zurich',
		counts: {
			recipients: 10,
			sent: 9,
			failed: 1,
			opened: 6,
			attachmentOpened: 0,
			clicked: 3,
			pageInteraction: 2,
			formSubmitted: 1,
			awarenessViewed: 1,
			reported: 1
		},
		rates: {
			open: 6 / 9,
			click: 3 / 9,
			submission: 1 / 9,
			awareness: 1 / 9,
			report: 1 / 9,
			attachment: 0
		},
		attentionPoints: ['Taux de clic élevé.', 'Aucun signalement spontané.'],
		recommendations: ['Organiser une session de sensibilisation.', 'Renouveler la campagne.'],
		summary: {
			verdict: 'Vigilance à renforcer : un tiers des destinataires ont cliqué.',
			tone: 'warning',
			keyFigure: { label: 'Taux de clic', value: '33 %' },
			secondaryFigure: { label: 'Taux de soumission', value: '11 %' },
			topRecommendation: 'Organiser une session de sensibilisation.'
		},
		branding: {
			issuerName: 'Acme Conseil',
			issuerContact: 'contact@acme.test',
			clientName: 'Client SA',
			clientContact: 'Jean Client · jean@client.test',
			scenario: 'Fausse page de connexion'
		},
		...over
	};
	return base;
}

test('émetteur : nom et contact présents dans la sortie', () => {
	const html = renderReportHtml(makeReport());
	expect(html).toContain('Acme Conseil');
	expect(html).toContain('contact@acme.test');
});

test('client : nom et contact présents dans la sortie', () => {
	const html = renderReportHtml(makeReport());
	expect(html).toContain('Client SA');
	expect(html).toContain('jean@client.test');
});

test('résumé exécutif : verdict et chiffre-clé présents', () => {
	const html = renderReportHtml(makeReport());
	expect(html).toContain('Vigilance à renforcer');
	expect(html).toContain('33 %');
	expect(html).toContain('Taux de clic');
});

test("entonnoir : barres et libellés d'étapes présents", () => {
	const html = renderReportHtml(makeReport());
	expect(html).toContain('ffill');
	expect(html).toContain('Envoyés');
	expect(html).toContain('Clics');
});

test('entonnoir : pièce jointe affichée seulement si ouverte', () => {
	expect(renderReportHtml(makeReport())).not.toContain('Pièce jointe ouverte');
	const withAttach = makeReport({
		counts: { ...makeReport().counts, attachmentOpened: 2 },
		rates: { ...makeReport().rates, attachment: 2 / 9 }
	});
	expect(renderReportHtml(withAttach)).toContain('Pièce jointe ouverte');
});

test('émetteur absent : pas de « undefined », « null » ni libellé orphelin', () => {
	const html = renderReportHtml(
		makeReport({
			branding: {
				issuerName: '',
				issuerContact: '',
				clientName: 'Client SA',
				clientContact: '',
				scenario: 'Fausse page de connexion'
			}
		})
	);
	expect(html).not.toContain('undefined');
	expect(html).not.toContain('null');
	expect(html).not.toContain('Émis par');
});

test('échappement : un campaignName avec balise est échappé', () => {
	const html = renderReportHtml(makeReport({ campaignName: '<script>alert(1)</script>' }));
	expect(html).not.toContain('<script>alert(1)</script>');
	expect(html).toContain('&#60;script&#62;');
});
