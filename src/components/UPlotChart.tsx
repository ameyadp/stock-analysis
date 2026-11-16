import { useEffect, useRef } from 'react';
import uPlot, { type AlignedData, type Options } from 'uplot';
import 'uplot/dist/uPlot.min.css';

/** Read a CSS custom property so charts follow the light/dark theme. */
export function cssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Thin React wrapper around uPlot: (re)creates the chart when options or data
 * change and keeps it sized to its container.
 */
export function UPlotChart({ options, data, height, label }: { options: Omit<Options, 'width' | 'height'>; data: AlignedData; height: number; label: string }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const chart = new uPlot({ ...options, width: el.clientWidth || 600, height }, data, el);
		const observer = new ResizeObserver(() => chart.setSize({ width: el.clientWidth, height }));
		observer.observe(el);
		return () => {
			observer.disconnect();
			chart.destroy();
		};
	}, [options, data, height]);

	return <div ref={ref} className="uplot-host" role="img" aria-label={label} />;
}
