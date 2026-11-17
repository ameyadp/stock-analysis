import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { isStandalone } from './lib/install';
import { pingInstall } from './lib/telemetry';
import './styles.css';

// Cache the app for offline use and pick up new versions automatically.
registerSW({ immediate: true });
window.addEventListener('appinstalled', () => void pingInstall());
// iPhone/iPad and Safari never fire "appinstalled", so also count on the first launch as an installed app.
if (isStandalone()) void pingInstall();

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
