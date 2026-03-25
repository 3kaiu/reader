import {
  isPotentialTermStart,
  quickPreCheck,
} from './helpers.ts'
import type { PotentialTerm, TermMatcher } from './types.ts'

const MAX_TERM_LEN = 8
const MIN_TERM_LEN = 2

export function extractPotentialTerms(content: string, matcher: TermMatcher): PotentialTerm[] {
  const results: PotentialTerm[] = []
  const processed = new Set<string>()

  for (let index = 0; index < content.length; index++) {
    if (!isPotentialTermStart(content[index])) {
      continue
    }

    for (let length = MAX_TERM_LEN; length >= MIN_TERM_LEN; length--) {
      if (index + length > content.length) {
        continue
      }

      const term = content.substring(index, index + length)
      if (processed.has(term)) {
        continue
      }

      if (!quickPreCheck(term) || !matcher.hasMatch(term)) {
        continue
      }

      results.push({ term, start: index, end: index + length })
      processed.add(term)
      index += length - 1
      break
    }
  }

  return results
}
