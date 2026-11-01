/* eslint-disable @typescript-eslint/no-explicit-any */
import { BubbleChart } from '@carbon/charts-react'
import { CHART_HEIGHT, useChartKit, type Tone } from './kit'

export type Dot = { group: string; x: number; y: number; r: number }

/** Dots placed by two measures, sized by volume and coloured by type. Reference lines mark the standard cut-offs. */
export default function BubbleScatter({ dots, tones, xTitle, yTitle, xLine, yLine, xMax, yMax, label, yLog = false, yMin = 0, rRange = [3, 12] }: {
  dots: Dot[]; tones: Record<string, Tone>; xTitle: string; yTitle: string; xLine: number | null; yLine: number | null; xMax: number; yMax: number; label: string
  /** a log scale on the vertical axis, for volumes that run over several orders of magnitude */
  yLog?: boolean; yMin?: number; rRange?: [number, number]
}) {
  const { tone, token, base } = useChartKit()
  const line = (value: number, text: string) => ({ value, label: text, fillColor: token('color.border.strong') })
  const options: any = {
    ...base,
    height: CHART_HEIGHT,
    title: '',
    accessibility: { svgAriaLabel: label },
    axes: {
      bottom: { mapsTo: 'x', scaleType: 'linear', title: xTitle, domain: [0, xMax], thresholds: xLine === null ? [] : [line(xLine, `${xLine}`)] },
      left: { mapsTo: 'y', scaleType: yLog ? 'log' : 'linear', title: yTitle, domain: [yMin, yMax], thresholds: yLine === null ? [] : [line(yLine, `${yLine}`)] },
    },
    bubble: { radiusMapsTo: 'r', radiusRange: () => rRange },
    legend: { truncation: { type: 'none' } },
    color: { scale: Object.fromEntries(Object.entries(tones).map(([k, t]) => [k, tone(t)])) },
  }
  return <BubbleChart data={dots} options={options} />
}
