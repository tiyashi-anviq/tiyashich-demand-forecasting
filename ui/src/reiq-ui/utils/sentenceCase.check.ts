// Self-check for sentenceCase. Run: node --experimental-strip-types src/utils/sentenceCase.check.ts
import { inSentence, sentenceCase } from './sentenceCase.ts'

const cases: [string, string][] = [
	['Deal Parameters', 'Deal parameters'],
	['Construction Vision & Quality AI', 'Construction vision & quality AI'],
	['Rent Free (Months)', 'Rent free (months)'],
	['REIQ', 'REIQ'],
	['Floors Offered to WeWork (Separate with comma)', 'Floors offered to WeWork (separate with comma)'],
	['Total Power (kVA)', 'Total power (kVA)'],
	['Rent + CAM (INR/RSF/month)', 'Rent + CAM (INR/RSF/month)'],
]
for (const [input, expected] of cases) {
	if (sentenceCase(input) !== expected) throw new Error(`${input} -> ${sentenceCase(input)}`)
}
for (const [input, expected] of [
	['Nearest highways', 'nearest highways'],
	['ROI forecast accuracy', 'ROI forecast accuracy'],
	['WeWork floors', 'WeWork floors'],
] as [string, string][]) {
	if (inSentence(input) !== expected) throw new Error(`inSentence ${input} -> ${inSentence(input)}`)
}
console.log('sentenceCase ok')
