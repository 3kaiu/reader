import type { DictionaryEntry } from '../../shared/types.ts'
import type { DictionaryIndexStats } from './types.ts'

class TrieNode {
  children: Map<string, TrieNode> = new Map()
  entries: DictionaryEntry[] = []
  isEndOfWord = false

  addEntry(entry: DictionaryEntry): void {
    this.entries.push(entry)
    this.isEndOfWord = true
  }

  findExact(): DictionaryEntry[] {
    return this.isEndOfWord ? this.entries : []
  }
}

export class OptimizedDictionaryIndex {
  private trie: TrieNode = new TrieNode()
  private fuzzyCache = new Map<string, DictionaryEntry[]>()
  private accessStats = new Map<string, number>()

  addEntry(entry: DictionaryEntry): void {
    const normalized = entry.original.toLowerCase()
    let node = this.trie

    for (const char of normalized) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode())
      }
      node = node.children.get(char)!
    }

    node.addEntry(entry)
  }

  findExact(term: string): DictionaryEntry[] {
    const normalized = term.toLowerCase()
    this.accessStats.set(normalized, (this.accessStats.get(normalized) || 0) + 1)

    let node = this.trie
    for (const char of normalized) {
      if (!node.children.has(char)) {
        return []
      }
      node = node.children.get(char)!
    }

    return node.findExact()
  }

  findFuzzy(term: string, maxDistance = 1): DictionaryEntry[] {
    const cacheKey = `${term}:${maxDistance}`
    if (this.fuzzyCache.has(cacheKey)) {
      return this.fuzzyCache.get(cacheKey)!
    }

    const results: DictionaryEntry[] = []
    this.dfsFuzzy(this.trie, '', term.toLowerCase(), 0, maxDistance, results)

    if (this.fuzzyCache.size > 1000) {
      const firstKey = this.fuzzyCache.keys().next().value
      if (typeof firstKey === 'string') {
        this.fuzzyCache.delete(firstKey)
      }
    }

    this.fuzzyCache.set(cacheKey, results)
    return results
  }

  private dfsFuzzy(
    node: TrieNode,
    current: string,
    target: string,
    index: number,
    maxDistance: number,
    results: DictionaryEntry[]
  ): void {
    if (index > target.length + maxDistance) {
      return
    }

    if (node.isEndOfWord && Math.abs(current.length - target.length) <= maxDistance) {
      results.push(...node.entries)
    }

    for (const [char, childNode] of node.children) {
      const cost = index < target.length && char !== target[index] ? 1 : 0
      if (cost <= maxDistance) {
        this.dfsFuzzy(
          childNode,
          current + char,
          target,
          index + (cost === 0 ? 1 : index),
          maxDistance - cost,
          results
        )
      }
    }
  }

  getHotTerms(limit = 10): string[] {
    return Array.from(this.accessStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term]) => term)
  }

  getStats(): DictionaryIndexStats {
    const countEntries = (node: TrieNode): number => {
      let count = node.entries.length
      for (const child of node.children.values()) {
        count += countEntries(child)
      }
      return count
    }

    return {
      totalEntries: countEntries(this.trie),
      cacheSize: this.fuzzyCache.size,
      hotTermsCount: this.accessStats.size,
    }
  }
}
