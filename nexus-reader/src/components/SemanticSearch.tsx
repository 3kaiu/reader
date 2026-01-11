/**
 * 语义搜索组件
 * 提供AI驱动的自然语言搜索界面
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { debounce } from 'lodash-es'
import { 
  semanticSearchApi, 
  SearchHistory, 
  SearchPerformanceMonitor,
  type SemanticSearchResult,
  type QueryAnalysis 
} from '@/api/semanticSearch'

interface SemanticSearchProps {
  onResultSelect?: (result: SemanticSearchResult) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

export const SemanticSearch: React.FC<SemanticSearchProps> = ({
  onResultSelect,
  placeholder = '使用自然语言搜索小说...',
  className = '',
  autoFocus = false
}) => {
  // 状态管理
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  const [queryAnalysis, setQueryAnalysis] = useState<QueryAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [searchType, setSearchType] = useState<'all' | 'novels' | 'chapters'>('all')

  // 加载搜索历史
  useEffect(() => {
    setSearchHistory(SearchHistory.getHistory())
  }, [])

  // 防抖搜索函数
  const debouncedSearch = useMemo(
    () => debounce(async (searchQuery: string, type: 'all' | 'novels' | 'chapters') => {
      if (!searchQuery.trim()) {
        setResults([])
        setQueryAnalysis(null)
        return
      }

      setIsLoading(true)
      const startTime = performance.now()

      try {
        const response = await semanticSearchApi.search(searchQuery, type)
        
        setResults(response.results)
        setQueryAnalysis(response.query)
        
        // 记录搜索性能
        const duration = performance.now() - startTime
        SearchPerformanceMonitor.recordSearchTime(searchQuery, duration)
        
      } catch (error) {
        console.error('语义搜索失败:', error)
        setResults([])
        setQueryAnalysis(null)
      } finally {
        setIsLoading(false)
      }
    }, 300),
    []
  )

  // 防抖建议获取函数
  const debouncedGetSuggestions = useMemo(
    () => debounce(async (partialQuery: string) => {
      if (partialQuery.length < 2) {
        setSuggestions([])
        return
      }

      try {
        const suggestions = await semanticSearchApi.getSuggestions(partialQuery)
        setSuggestions(suggestions)
      } catch (error) {
        console.error('获取搜索建议失败:', error)
        setSuggestions([])
      }
    }, 200),
    []
  )

  // 处理搜索
  const handleSearch = useCallback((searchQuery: string) => {
    if (searchQuery.trim()) {
      SearchHistory.addToHistory(searchQuery)
      setSearchHistory(SearchHistory.getHistory())
    }
    debouncedSearch(searchQuery, searchType)
  }, [debouncedSearch, searchType])

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    setSelectedIndex(-1)
    
    if (value.trim()) {
      handleSearch(value)
      debouncedGetSuggestions(value)
    } else {
      setResults([])
      setQueryAnalysis(null)
      setSuggestions([])
    }
  }

  // 处理键盘导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = results.length + suggestions.length + searchHistory.length

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % totalItems)
        break
      
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev <= 0 ? totalItems - 1 : prev - 1)
        break
      
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0) {
          handleItemSelect(selectedIndex)
        } else if (query.trim()) {
          handleSearch(query)
        }
        break
      
      case 'Escape':
        setIsExpanded(false)
        setSelectedIndex(-1)
        break
    }
  }

  // 处理项目选择
  const handleItemSelect = (index: number) => {
    let selectedItem: string | SemanticSearchResult

    if (index < results.length) {
      // 选择搜索结果
      selectedItem = results[index]
      onResultSelect?.(selectedItem as SemanticSearchResult)
    } else if (index < results.length + suggestions.length) {
      // 选择建议
      selectedItem = suggestions[index - results.length]
      setQuery(selectedItem as string)
      handleSearch(selectedItem as string)
    } else {
      // 选择历史记录
      selectedItem = searchHistory[index - results.length - suggestions.length]
      setQuery(selectedItem as string)
      handleSearch(selectedItem as string)
    }

    setIsExpanded(false)
    setSelectedIndex(-1)
  }

  // 渲染搜索结果项
  const renderResultItem = (result: SemanticSearchResult, index: number) => (
    <div
      key={`result-${result.id}`}
      className={`search-result-item ${selectedIndex === index ? 'selected' : ''}`}
      onClick={() => handleItemSelect(index)}
    >
      <div className="result-header">
        <span className="result-title">{result.title}</span>
        <span className="result-type">{result.type === 'novel' ? '小说' : '章节'}</span>
        <span className="similarity-score">{Math.round(result.similarity * 100)}%</span>
      </div>
      
      {result.author && (
        <div className="result-author">作者: {result.author}</div>
      )}
      
      {result.description && (
        <div className="result-description">{result.description.substring(0, 100)}...</div>
      )}
      
      {result.summary && (
        <div className="result-summary">{result.summary}</div>
      )}
      
      {result.aiTags && result.aiTags.length > 0 && (
        <div className="result-tags">
          {result.aiTags.slice(0, 3).map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      )}
    </div>
  )

  // 渲染建议项
  const renderSuggestionItem = (suggestion: string, index: number) => (
    <div
      key={`suggestion-${suggestion}`}
      className={`suggestion-item ${selectedIndex === results.length + index ? 'selected' : ''}`}
      onClick={() => handleItemSelect(results.length + index)}
    >
      <span className="suggestion-icon">💡</span>
      <span className="suggestion-text">{suggestion}</span>
    </div>
  )

  // 渲染历史记录项
  const renderHistoryItem = (historyItem: string, index: number) => (
    <div
      key={`history-${historyItem}`}
      className={`history-item ${selectedIndex === results.length + suggestions.length + index ? 'selected' : ''}`}
      onClick={() => handleItemSelect(results.length + suggestions.length + index)}
    >
      <span className="history-icon">🕒</span>
      <span className="history-text">{historyItem}</span>
    </div>
  )

  return (
    <div className={`semantic-search ${className}`}>
      {/* 搜索输入框 */}
      <div className="search-input-container">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsExpanded(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="search-input"
        />
        
        {/* 搜索类型选择器 */}
        <select
          value={searchType}
          onChange={(e) => setSearchType(e.target.value as 'all' | 'novels' | 'chapters')}
          className="search-type-selector"
        >
          <option value="all">全部</option>
          <option value="novels">小说</option>
          <option value="chapters">章节</option>
        </select>
        
        {/* 加载指示器 */}
        {isLoading && <div className="loading-indicator">🔍</div>}
      </div>

      {/* 查询分析显示 */}
      {queryAnalysis && (
        <div className="query-analysis">
          <div className="analysis-item">
            <strong>搜索意图:</strong> {queryAnalysis.intent}
          </div>
          {queryAnalysis.keywords.length > 0 && (
            <div className="analysis-item">
              <strong>关键词:</strong> {queryAnalysis.keywords.join(', ')}
            </div>
          )}
          {queryAnalysis.synonyms.length > 0 && (
            <div className="analysis-item">
              <strong>相关词:</strong> {queryAnalysis.synonyms.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* 搜索结果下拉框 */}
      {isExpanded && (
        <div className="search-dropdown">
          {/* 搜索结果 */}
          {results.length > 0 && (
            <div className="results-section">
              <div className="section-header">搜索结果 ({results.length})</div>
              {results.map((result, index) => renderResultItem(result, index))}
            </div>
          )}

          {/* 搜索建议 */}
          {suggestions.length > 0 && (
            <div className="suggestions-section">
              <div className="section-header">搜索建议</div>
              {suggestions.map((suggestion, index) => renderSuggestionItem(suggestion, index))}
            </div>
          )}

          {/* 搜索历史 */}
          {searchHistory.length > 0 && !query && (
            <div className="history-section">
              <div className="section-header">
                搜索历史
                <button 
                  onClick={() => {
                    SearchHistory.clearHistory()
                    setSearchHistory([])
                  }}
                  className="clear-history-btn"
                >
                  清除
                </button>
              </div>
              {searchHistory.slice(0, 5).map((historyItem, index) => 
                renderHistoryItem(historyItem, index)
              )}
            </div>
          )}

          {/* 无结果提示 */}
          {query && !isLoading && results.length === 0 && suggestions.length === 0 && (
            <div className="no-results">
              <div className="no-results-text">未找到相关结果</div>
              <div className="no-results-suggestion">
                尝试使用不同的关键词或更详细的描述
              </div>
            </div>
          )}
        </div>
      )}

      {/* 点击外部关闭下拉框 */}
      {isExpanded && (
        <div 
          className="search-overlay" 
          onClick={() => setIsExpanded(false)}
        />
      )}
    </div>
  )
}

export default SemanticSearch