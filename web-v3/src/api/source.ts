import { $post, $get } from './client'

export interface BookSource {
    bookUrl: string
    origin: string
    originName: string
    name: string
    author: string
    latestChapterTitle?: string
    time?: number
    type?: number
    coverUrl?: string
}

export interface BookSourceGroup {
    name: string
    value: string
    count: number
}

export const sourceApi = {
    // 获取可用书源
    getAvailableBookSource: (bookUrl: string, refresh = false) =>
        $post<BookSource[]>('/getAvailableBookSource', {
            url: bookUrl,
            refresh: refresh ? 1 : 0
        }),

    // 切换书源
    setBookSource: (bookUrl: string, newUrl: string, bookSourceUrl: string) =>
        $post('/setBookSource', {
            bookUrl,
            newUrl,
            bookSourceUrl
        }),

    // 搜索书源 (普通搜索)
    searchBookSource: (url: string, bookSourceGroup: string, lastIndex: number) =>
        $post<{ list: BookSource[]; lastIndex: number }>('/searchBookSource', {
            url,
            bookSourceGroup,
            lastIndex
        }),

    // 获取SSE搜索URL
    getSearchBookSourceSSEUrl: (params: {
        accessToken?: string
        url: string
        bookSourceGroup?: string
        lastIndex?: number
        concurrentCount?: number
    }) => {
        const query = new URLSearchParams()
        if (params.accessToken) query.append('accessToken', params.accessToken)
        if (params.url) query.append('url', params.url)
        if (params.bookSourceGroup) query.append('bookSourceGroup', params.bookSourceGroup)
        if (params.lastIndex !== undefined) query.append('lastIndex', String(params.lastIndex))
        if (params.concurrentCount) query.append('concurrentCount', String(params.concurrentCount))
        return `/searchBookSourceSSE?${query.toString()}`
    },

    // === 管理接口 ===

    // 获取所有书源
    getBookSources: () => $get<BookSource[]>('/getBookSources'),

    // 保存书源
    saveBookSource: (source: string) => $post('/saveBookSource', { source }),

    // 删除书源
    deleteBookSource: (bookSourceUrl: string) => $post('/deleteBookSource', { bookSourceUrl }),

    // 导入书源
    importBookSource: (source: string) => $post('/importBookSource', { source }),

    // 调试书源 (根据原版逻辑，可能是 getBookSourceTest ?)
    // 假设后端有测试接口，或者只是前端模拟请求
    testBookSource: (bookSourceUrl: string) => $post('/testBookSource', { bookSourceUrl }),

    // 读取远程书源文件
    readRemoteSourceFile: (url: string) => $post<string[]>('/readRemoteSourceFile', { url }),

    // === 书源订阅功能 ===

    // 获取订阅源列表
    getSubscriptions: () =>
        $get<string>('/file/get', { params: { path: 'remoteBookSourceSub.json', home: '__HOME__' } }),

    // 保存订阅源列表
    saveSubscriptions: (data: string) =>
        $post('/file/save', { path: 'remoteBookSourceSub.json', content: data, home: '__HOME__' }),

    // 从远程URL同步书源
    syncFromRemote: (url: string) =>
        $post<{ count: number }>('/saveFromRemoteSource', { url })
}
