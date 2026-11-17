import { useEffect, useState } from 'react';
import { canPromptInstall, isStandalone, markInstallNoticeSeen, onInstallAvailabilityChange, platform, promptInstall } from '../lib/install';

const APP = 'Stock Analysis';

/** The mandatory, anonymous install count, shown before every install route. */
export function InstallNotice() {
	return (
		<p className="install-notice">
			<strong>Install counting is required.</strong> Installing {APP} sends one anonymous count: just the word “install” and the app
			version, with no ID and none of your data. It can’t be turned off.
		</p>
	);
}

export function InstallDialog({ onClose }: { onClose: () => void }) {
	const [canPrompt, setCanPrompt] = useState(canPromptInstall);
	const [status, setStatus] = useState<'idle' | 'installed' | 'dismissed'>('idle');
	const mode = isStandalone() ? 'installed' : canPrompt ? 'prompt' : platform();

	useEffect(() => onInstallAvailabilityChange(() => setCanPrompt(canPromptInstall())), []);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	async function install() {
		markInstallNoticeSeen();
		setStatus((await promptInstall()) ? 'installed' : 'dismissed');
	}

	function acknowledge() {
		markInstallNoticeSeen();
		onClose();
	}

	return (
		<div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
			<div className="dialog" role="dialog" aria-modal="true" aria-labelledby="install-title">
				<h2 id="install-title">Install {APP}</h2>

				{status === 'installed' ? (
					<>
						<p>Installed. You’ll find {APP} with your other apps.</p>
						<div className="actions">
							<button type="button" onClick={onClose}>
								Done
							</button>
						</div>
					</>
				) : mode === 'installed' ? (
					<>
						<p>You’re already using the installed app.</p>
						<div className="actions">
							<button type="button" onClick={onClose}>
								Close
							</button>
						</div>
					</>
				) : (
					<>
						<p>Install it on this device to open it in its own window, from your dock, start menu or home screen, even offline.</p>

						{mode === 'ios' && (
							<ol className="install-steps">
								<li>
									Tap the <strong>Share</strong> button (the square with an arrow).
								</li>
								<li>
									Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
								</li>
							</ol>
						)}
						{mode === 'mac-safari' && (
							<ol className="install-steps">
								<li>
									In Safari’s menu bar, choose <strong>File → Add to Dock</strong>.
								</li>
								<li>
									Click <strong>Add</strong>.
								</li>
							</ol>
						)}
						{mode === 'other' && (
							<ol className="install-steps">
								<li>
									In <strong>Chrome</strong> or <strong>Edge</strong>, click the install icon at the right end of the address bar, or open
									the browser menu and choose <strong>Install {APP}</strong>.
								</li>
								<li>Firefox can’t install web apps. Open this page in Chrome, Edge or Safari instead.</li>
							</ol>
						)}

						<InstallNotice />
						{status === 'dismissed' && <p className="muted small">Install cancelled. You can install any time from this button.</p>}

						<div className="actions">
							{mode === 'prompt' ? (
								<button type="button" onClick={() => void install()}>
									Agree &amp; install
								</button>
							) : (
								<button type="button" onClick={acknowledge}>
									Got it
								</button>
							)}
							<button type="button" className="secondary" onClick={onClose}>
								Cancel
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

/** Shown once in the installed app if it was installed from the browser's own menu (so the notice wasn't seen first). */
export function InstalledNotice({ onClose }: { onClose: () => void }) {
	return (
		<aside className="banner" role="region" aria-label="Install notice">
			<p>
				<strong>Thanks for installing {APP}.</strong> Installs are counted anonymously: just the word “install” and the app version,
				with no ID and none of your data. This is required and can’t be turned off.
			</p>
			<div className="actions">
				<button
					type="button"
					onClick={() => {
						markInstallNoticeSeen();
						onClose();
					}}
				>
					Got it
				</button>
			</div>
		</aside>
	);
}
