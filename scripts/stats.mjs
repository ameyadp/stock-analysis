// Print usage numbers from the telemetry database.
//   npm run stats            → production (remote) database
//   npm run stats -- --local → local dev database
import { execFileSync } from 'node:child_process';

const target = process.argv.includes('--local') ? '--local' : '--remote';

function query(sql) {
	const out = execFileSync(
		'npx',
		['wrangler', 'd1', 'execute', 'stock-analysis-telemetry', target, '--json', '--command', sql],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
	);
	return JSON.parse(out)[0]?.results ?? [];
}

const sections = [
	[
		'Totals',
		`SELECT
			(SELECT COUNT(DISTINCT anon_id) FROM events WHERE event = 'opt_in')  AS opted_in_devices,
			(SELECT COUNT(DISTINCT anon_id) FROM events WHERE event = 'setup_complete') AS set_up_keys,
			(SELECT COUNT(DISTINCT anon_id) FROM events WHERE event = 'install') AS installs,
			(SELECT COUNT(DISTINCT anon_id) FROM events WHERE event = 'active' AND day >= date('now', '-6 days'))  AS weekly_active,
			(SELECT COUNT(DISTINCT anon_id) FROM events WHERE event = 'active' AND day >= date('now', '-29 days')) AS monthly_active`,
	],
	[
		'Daily active devices (last 14 days)',
		`SELECT day, COUNT(DISTINCT anon_id) AS active
		 FROM events WHERE event = 'active' AND day >= date('now', '-13 days')
		 GROUP BY day ORDER BY day`,
	],
	[
		'New opt-ins per week',
		`SELECT strftime('%Y-W%W', day) AS week, COUNT(DISTINCT anon_id) AS new_devices
		 FROM events WHERE event = 'opt_in'
		 GROUP BY week ORDER BY week DESC LIMIT 12`,
	],
	[
		'Retention: devices active in 2+ different weeks',
		`SELECT COUNT(*) AS returning_devices FROM (
			SELECT anon_id FROM events WHERE event = 'active'
			GROUP BY anon_id HAVING COUNT(DISTINCT strftime('%Y-%W', day)) >= 2
		 )`,
	],
	[
		'Active devices by app version (last 30 days)',
		`SELECT version, COUNT(DISTINCT anon_id) AS devices
		 FROM events WHERE event = 'active' AND day >= date('now', '-29 days')
		 GROUP BY version ORDER BY version DESC`,
	],
];

for (const [title, sql] of sections) {
	console.log(`\n${title}`);
	const rows = query(sql);
	if (rows.length === 0) console.log('  (no data yet)');
	else console.table(rows);
}
