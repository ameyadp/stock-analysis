import { useEffect, useState } from 'react';
import { androidBrowser, canPromptInstall, iosBrowser, isInstalled, isStandalone, markInstallNoticeSeen, onInstallAvailabilityChange, platform, promptInstall } from '../lib/install';
import { isRegistered } from '../lib/registration';
import { RegistrationForm } from './RegistrationForm';

const APP = 'Stock Analysis';

/** The mandatory, anonymous install count, shown before every install route. */
export function InstallNotice() {
	return (
		<p className="install-notice">
			<strong>Usage counting is required.</strong> {APP} counts each install and app open, and once a day sends a random ID, the
			app version and the word “active”, so I can see how many people use it. Never your keys or tickers.
		</p>
	);
}

function ShareIcon() {
	return (
		<svg className="share-icon" viewBox="0 0 24 24" width="18" height="18" aria-label="Share icon" role="img">
			<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	);
}

/** iPhone and iPad: no install button exists for websites, so walk people through Add to Home Screen. */
function IosSteps() {
	const browser = iosBrowser();
	const name = browser === 'chrome' ? 'Chrome' : browser === 'safari' ? 'Safari' : 'your browser';
	return (
		<>
			<p className="ios-why">
				iPhone and iPad don’t let websites install apps with a button, so it takes three quick taps in {name}:
			</p>
			<ol className="install-steps">
				<li>
					Tap <strong>Share</strong> <ShareIcon />{' '}
					{browser === 'chrome' ? (
						<>at the top right, in the address bar.</>
					) : browser === 'safari' ? (
						<>
							in the toolbar at the bottom of the screen. On newer iOS, tap <strong>•••</strong> first; on iPad, Share is at the top right.
						</>
					) : (
						<>in your browser’s toolbar or menu.</>
					)}
				</li>
				<li>
					Scroll down and tap <strong>Add to Home Screen</strong>
					{browser === 'safari' && <> (if it’s missing, tap <strong>View More</strong>)</>}.
				</li>
				<li>
					Tap <strong>Add</strong>. {APP} appears on your Home Screen: open it from there.
				</li>
			</ol>
		</>
	);
}

/** Android, when the browser hasn't offered its own install prompt. */
function AndroidSteps() {
	const browser = androidBrowser();
	return (
		<>
			<p className="ios-why">If {APP} is already installed, open it from your home screen or app drawer. Otherwise:</p>
			<ol className="install-steps">
				{browser === 'samsung' ? (
					<li>
						Tap <strong>☰</strong> (bottom right) → <strong>Add page to</strong> → <strong>Home screen</strong>, or the install icon in the address bar.
					</li>
				) : browser === 'firefox' ? (
					<li>
						Tap <strong>⋮</strong> (top right) → <strong>Add app to Home screen</strong> (or <strong>Install</strong>).
					</li>
				) : (
					<li>
						Tap <strong>⋮</strong> (top right) → <strong>Install app</strong> or <strong>Add to Home screen</strong>.
					</li>
				)}
				<li>
					Confirm with <strong>Install</strong> or <strong>Add</strong>. {APP} then opens from your home screen like any app.
				</li>
			</ol>
		</>
	);
}

export function InstallDialog({ onClose }: { onClose: () => void }) {
	const [canPrompt, setCanPrompt] = useState(canPromptInstall);
	const [status, setStatus] = useState<'idle' | 'installed' | 'dismissed'>('idle');
	const [registered, setRegistered] = useState(isRegistered);
	const mode = isStandalone() ? 'installed' : canPrompt ? 'prompt' : isInstalled() ? 'already' : platform();

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
				<h2 id="install-title">{mode === 'ios' ? `Add ${APP} to your Home Screen` : `Install ${APP}`}</h2>

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
				) : mode === 'already' ? (
					<>
						<p>
							<strong>{APP} is already installed on this device.</strong> Open it like any other app:
						</p>
						<ul className="install-steps">
							<li>
								<strong>Mac:</strong> from the Dock, Launchpad or Spotlight (search “{APP}”).
							</li>
							<li>
								<strong>Windows:</strong> from the Start menu or taskbar.
							</li>
							<li>
								<strong>Phone or tablet:</strong> from your home screen.
							</li>
							<li>
								In <strong>Chrome</strong> or <strong>Edge</strong>, you can also click <strong>Open in app</strong> at the right end of the
								address bar.
							</li>
						</ul>
						<p className="muted small">Removed it? Reload this page and installing will be offered again.</p>
						<div className="actions">
							<button type="button" onClick={onClose}>
								Use in the browser
							</button>
						</div>
					</>
				) : !registered ? (
					<>
						<p>
							<strong>Step 1 of 2:</strong> installing {APP} needs a quick sign-up.
						</p>
						<RegistrationForm submitLabel="Continue to install" onDone={() => setRegistered(true)} />
						<div className="actions">
							<button type="button" className="secondary" onClick={onClose}>
								Cancel
							</button>
						</div>
					</>
				) : (
					<>
						{mode !== 'ios' && <p>Install it on this device to open it in its own window, from your dock, start menu or home screen, even offline.</p>}

						{mode === 'ios' && <IosSteps />}
						{mode === 'android' && <AndroidSteps />}
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
						{(mode === 'chrome' || mode === 'edge') && (
							<>
								<p className="small">Your browser hasn’t offered to install {APP} on this page. Usually that means one of these:</p>
								<ul className="install-steps">
									<li>
										<strong>It’s already installed.</strong> Open it from your Dock, Launchpad or Start menu, or click <strong>Open in app</strong>{' '}
										at the right end of the address bar.
									</li>
									<li>
										<strong>Install it from the browser menu:</strong>{' '}
										{mode === 'chrome' ? (
											<>
												click <strong>⋮</strong> (top right) → <strong>Cast, save, and share</strong> → <strong>Install {APP}…</strong>
											</>
										) : (
											<>
												click <strong>…</strong> (top right) → <strong>Apps</strong> → <strong>Install {APP}</strong>
											</>
										)}
										, or the install icon at the right end of the address bar.
									</li>
									<li>
										<strong>Another app covers this whole site.</strong> If you once installed ameyapurandare.com itself as an app, remove it
										(open <strong>chrome://apps</strong>, right-click it, <strong>Remove</strong>), then reload this page.
									</li>
								</ul>
							</>
						)}
						{mode === 'firefox' && <p>Firefox can’t install web apps. Open this page in Chrome, Edge or Safari to install {APP}.</p>}
						{mode === 'other' && (
							<p>
								Look for <strong>Install</strong> or <strong>Add to Home Screen</strong> in your browser’s menu. If there isn’t one, open this page in
								Chrome, Edge or Safari.
							</p>
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
									{mode === 'ios' ? 'OK' : 'Got it'}
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
				<strong>Thanks for installing {APP}.</strong> Installs and app opens are counted anonymously: just the event (“install” or
				“open”) and the app version, with no ID and none of your data. This is required and can’t be turned off.
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
