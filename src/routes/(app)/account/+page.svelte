<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		Button,
		CopyButton,
		ErrorNotice,
		Field,
		LocalTime,
		Page,
		Panel,
		Plate
	} from '$lib/components/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const recoveryCodes = $derived(
		form?.totp && 'recoveryCodes' in form.totp ? form.totp.recoveryCodes : null
	);
	const totpError = $derived(form?.totp && 'error' in form.totp ? form.totp.error : null);
	const passwordForm = $derived(form?.password);
	const emailForm = $derived(form?.email);
	const sessionsError = $derived(
		form?.sessions && 'error' in form.sessions ? form.sessions.error : null
	);
</script>

<Page
	title="Mon compte"
	description="Connecté en tant que {data.email}. Gérez votre adresse, votre mot de passe et vos sessions."
>
	<div class="grid items-start gap-4 lg:grid-cols-2">
		<Panel>
			{#snippet header()}
				<h2 class="rf-title">Adresse e-mail</h2>
			{/snippet}
			<form method="POST" action="?/email" use:enhance class="flex flex-col gap-4">
				<p class="text-ink-dim">
					Adresse actuelle : <span class="text-ink [overflow-wrap:anywhere]">{data.email}</span>
				</p>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field
						label="Nouvelle adresse e-mail"
						name="email"
						type="email"
						autocomplete="email"
						help="Cette adresse sert à vous connecter et à recevoir les e-mails de test des profils d'envoi. Aucun e-mail de confirmation n'est envoyé : vérifiez-la bien."
						required
					/>
					<Field
						label="Mot de passe actuel"
						name="password"
						type="password"
						autocomplete="current-password"
						required
					/>
				</div>
				{#if emailForm && 'error' in emailForm}
					<ErrorNotice message={emailForm.error} />
				{:else if emailForm && 'success' in emailForm}
					<p class="text-ink" role="status">
						Adresse e-mail modifiée. Vos autres sessions ont été fermées ({emailForm.revoked}).
					</p>
				{/if}
				<Button type="submit" variant="primary" class="w-full md:w-auto md:self-start">
					Changer l'adresse e-mail
				</Button>
			</form>
		</Panel>

		<Panel>
			{#snippet header()}
				<h2 class="rf-title">Mot de passe</h2>
			{/snippet}
			<form method="POST" action="?/password" use:enhance class="flex flex-col gap-4">
				<Field
					label="Mot de passe actuel"
					name="current"
					type="password"
					autocomplete="current-password"
					required
				/>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field
						label="Nouveau mot de passe"
						name="next"
						type="password"
						autocomplete="new-password"
						minlength={data.minPasswordLength}
						help="Au moins {data.minPasswordLength} caractères."
						required
					/>
					<Field
						label="Confirmation"
						name="confirm"
						type="password"
						autocomplete="new-password"
						minlength={data.minPasswordLength}
						required
					/>
				</div>
				{#if passwordForm && 'error' in passwordForm}
					<ErrorNotice message={passwordForm.error} />
				{:else if passwordForm && 'success' in passwordForm}
					<p class="text-ink" role="status">
						Mot de passe modifié. Vos autres sessions ont été fermées ({passwordForm.revoked}).
					</p>
				{/if}
				<Button type="submit" variant="primary" class="w-full md:w-auto md:self-start">
					Changer le mot de passe
				</Button>
			</form>
		</Panel>

		<Panel>
			{#snippet header()}
				<h2 class="rf-title">Double authentification (TOTP)</h2>
				{#if data.totp.enabled}
					<Plate variant="signal">Active</Plate>
				{:else}
					<Plate variant="neutral">Inactive</Plate>
				{/if}
			{/snippet}
			<div class="flex flex-col gap-4">
				{#if recoveryCodes}
					<div class="flex flex-col gap-3 rounded-md border border-line p-3">
						<p class="text-ink">
							Double authentification activée. Conservez ces codes de secours en lieu sûr : chacun
							n'est utilisable qu'une fois et ils ne seront plus affichés.
						</p>
						<ul class="grid grid-cols-2 gap-2 font-mono text-ink">
							{#each recoveryCodes as code (code)}
								<li>{code}</li>
							{/each}
						</ul>
						<CopyButton value={recoveryCodes.join('\n')} what="les codes de secours" size="sm" />
					</div>
				{/if}

				{#if data.totp.enabled}
					<p class="text-ink-dim">
						Un code de votre application d'authentification est demandé à chaque connexion. Codes de
						secours restants : {data.totp.remainingRecoveryCodes}.
					</p>
					<form method="POST" action="?/totpDisable" use:enhance class="flex flex-col gap-4">
						<div class="grid gap-4 sm:grid-cols-2">
							<Field
								label="Mot de passe"
								name="password"
								type="password"
								autocomplete="current-password"
								required
							/>
							<Field
								label="Code ou code de secours"
								name="code"
								autocomplete="one-time-code"
								required
							/>
						</div>
						<Button type="submit" variant="danger" class="w-full md:w-auto md:self-start">
							Désactiver la double authentification
						</Button>
					</form>
				{:else if data.totp.pending}
					<p class="text-ink-dim">
						Scannez ce QR code avec votre application d'authentification, puis saisissez le code
						affiché pour confirmer.
					</p>
					<img
						src={data.totp.pending.qr}
						alt="QR code d'enrôlement TOTP"
						width="192"
						height="192"
						class="rounded-md bg-white p-2"
					/>
					<p class="rf-meta flex flex-wrap items-center gap-2">
						Clé manuelle :
						<code class="font-mono [overflow-wrap:anywhere] text-ink">
							{data.totp.pending.secret}
						</code>
						<CopyButton value={data.totp.pending.secret} what="la clé" size="sm" />
					</p>
					<form method="POST" action="?/totpConfirm" use:enhance class="flex flex-col gap-4">
						<Field
							label="Mot de passe actuel"
							name="password"
							type="password"
							autocomplete="current-password"
							required
						/>
						<Field
							label="Code à 6 chiffres"
							name="code"
							autocomplete="one-time-code"
							inputmode="numeric"
							required
						/>
						<Button type="submit" variant="primary" class="w-full md:w-auto md:self-start">
							Confirmer
						</Button>
					</form>
				{:else}
					<p class="text-ink-dim">
						Protégez votre compte avec un code temporaire généré par une application
						d'authentification, en plus du mot de passe.
					</p>
					<form method="POST" action="?/totpStart" use:enhance>
						<Button type="submit" class="w-full md:w-auto">
							Activer la double authentification
						</Button>
					</form>
				{/if}
				{#if totpError}
					<ErrorNotice message={totpError} />
				{/if}
			</div>
		</Panel>

		<Panel flush>
			{#snippet header()}
				<h2 class="rf-title">Sessions actives</h2>
				{#if data.sessions.length > 1}
					<form method="POST" action="?/revokeOthers" use:enhance>
						<Button type="submit" size="sm">Fermer les autres sessions</Button>
					</form>
				{/if}
			{/snippet}
			<ul class="divide-y divide-line">
				{#each data.sessions as s (s.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
						<span class="flex min-w-0 flex-col gap-1">
							<span class="text-ink [overflow-wrap:anywhere]">
								{s.userAgent ?? 'Navigateur inconnu'}
							</span>
							<span class="rf-meta">
								Ouverte : <LocalTime value={s.createdAt} /> · Dernière activité :
								<LocalTime value={s.lastUsedAt} />
							</span>
						</span>
						{#if s.current}
							<Plate variant="info">Session actuelle</Plate>
						{:else}
							<form method="POST" action="?/revokeSession" use:enhance>
								<input type="hidden" name="sessionId" value={s.id} />
								<Button type="submit" variant="ghost" size="sm">Révoquer</Button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
			{#if sessionsError}
				<div class="p-4"><ErrorNotice message={sessionsError} /></div>
			{/if}
		</Panel>
	</div>
</Page>
