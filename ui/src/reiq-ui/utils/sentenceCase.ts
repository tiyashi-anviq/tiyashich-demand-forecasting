/** Sentence case for a name that arrives in Title Case ("Deal Parameters" becomes "Deal
 *  parameters"), per the copy rules. An all-caps word (AI, RSF, REIQ) is an acronym and keeps
 *  its case, and so does a word with a capital right after another letter: a mixed-case name
 *  or unit (WeWork, AutoCADs, kVA, INR/RSF/month). Only for text that comes from data or
 *  config; copy written in code is already sentence case. */
const keepsCase = (word: string) => word === word.toUpperCase() || /\p{L}\p{Lu}/u.test(word)

export function sentenceCase(label: string): string {
	return label
		.split(' ')
		.map((word, i) => (i === 0 || keepsCase(word) ? word : word.toLowerCase()))
		.join(' ')
}

/** A sentence-case name used mid-sentence ("all 5 nearest highways"): the first letter drops to
 *  lower case, unless the first word is an acronym or carries an inner capital (ROI, WeWork). */
export function inSentence(label: string): string {
	const first = label.split(' ')[0] ?? ''
	if (first.length > 1 && first.slice(1) !== first.slice(1).toLowerCase()) return label
	return label.charAt(0).toLowerCase() + label.slice(1)
}
