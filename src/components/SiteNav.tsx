import { isStandalone } from '../lib/install';

const LINKS: [string, string][] = [
	['/projects/', 'Projects'],
	['/blog/', 'Writing'],
	['/about/', 'About me'],
];

/** Slim bar linking back to ameyapurandare.com. In the installed app, links open in the browser. */
export function SiteNav() {
	const external = isStandalone() ? { target: '_blank', rel: 'noopener' } : {};
	return (
		<nav className="site-nav" aria-label="ameyapurandare.com">
			<a href="/" className="site-home" {...external}>
				← Ameya Purandare
			</a>
			<span className="site-links">
				{LINKS.map(([href, label]) => (
					<a key={href} href={href} {...external}>
						{label}
					</a>
				))}
			</span>
		</nav>
	);
}
