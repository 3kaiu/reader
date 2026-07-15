type SourceDefinition = Record<string, unknown>

const SOURCE_IMPORT_FORMATS = {
  NXS: 'NXS 单源',
  ARRAY: 'NXS 数组',
  WRAPPER: 'NXS 包装集合',
  LEGADO: 'Legado 书源',
  LEGADO_ARRAY: 'Legado 书源数组',
  UNKNOWN: '未知格式',
} as const

export type ParsedSourceImport = {
  success: boolean
  sources: SourceDefinition[]
  format: string
  error?: string
}

function isNxsSource(source: unknown): source is SourceDefinition {
  return Boolean(
    source &&
      typeof source === 'object' &&
      'id' in source &&
      'name' in source &&
      'url' in source &&
      'search' in source &&
      'book' in source &&
      'toc' in source &&
      'content' in source
  )
}

function isLegadoSource(source: unknown): source is SourceDefinition {
  return Boolean(
    source &&
      typeof source === 'object' &&
      ('bookSourceUrl' in source || 'book_source_url' in source)
  )
}

export function parseSourceImportText(text: string): ParsedSourceImport {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      success: false,
      sources: [],
      format: SOURCE_IMPORT_FORMATS.UNKNOWN,
      error: '内容为空',
    }
  }

  let data: unknown
  try {
    data = JSON.parse(trimmed)
  } catch {
    return {
      success: false,
      sources: [],
      format: SOURCE_IMPORT_FORMATS.UNKNOWN,
      error: 'JSON格式错误',
    }
  }

  // Check for NXS sources first
  if (isNxsSource(data)) {
    return {
      success: true,
      sources: [data],
      format: SOURCE_IMPORT_FORMATS.NXS,
    }
  }

  if (Array.isArray(data)) {
    if (data.every(isNxsSource)) {
      return {
        success: true,
        sources: data,
        format: SOURCE_IMPORT_FORMATS.ARRAY,
      }
    }

    // Check for Legado array
    if (data.length > 0 && data.every(isLegadoSource)) {
      return {
        success: true,
        sources: data,
        format: SOURCE_IMPORT_FORMATS.LEGADO_ARRAY,
      }
    }

    return {
      success: false,
      sources: [],
      format: SOURCE_IMPORT_FORMATS.UNKNOWN,
      error: '数组中的书源必须全部符合 NXS 或 Legado 结构',
    }
  }

  // Check for Legado single source
  if (isLegadoSource(data)) {
    return {
      success: true,
      sources: [data],
      format: SOURCE_IMPORT_FORMATS.LEGADO,
    }
  }

  if (data && typeof data === 'object') {
    for (const key of ['sources', 'bookSources', 'items']) {
      const list = (data as Record<string, unknown>)[key]
      if (Array.isArray(list) && list.length > 0 && list.every(isNxsSource)) {
        return {
          success: true,
          sources: list,
          format: `${SOURCE_IMPORT_FORMATS.WRAPPER} (${key})`,
        }
      }
      // Check for Legado format in wrapper
      if (Array.isArray(list) && list.length > 0 && list.every(isLegadoSource)) {
        return {
          success: true,
          sources: list,
          format: `${SOURCE_IMPORT_FORMATS.LEGADO_ARRAY} (${key})`,
        }
      }
    }
  }

  return {
    success: false,
    sources: [],
    format: SOURCE_IMPORT_FORMATS.UNKNOWN,
    error: '仅支持符合 NXS 或 Legado 结构的书源 JSON',
  }
}
