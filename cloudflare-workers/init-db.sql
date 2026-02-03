-- Nexus Reader D1 Database Schema v2.0
-- 优化后的SQLite数据库，专门为Cloudflare D1设计
-- 500k reads/month, 50k writes/month, 1GB storage

-- ============================================================================
-- 核心表：用户和会话
-- ============================================================================

-- 用户档案表（核心用户数据）
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    preferences TEXT, -- JSON 用户偏好设置
    metadata TEXT     -- JSON 额外元数据
);

-- 用户会话表（登录会话跟踪）
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    device_info TEXT, -- JSON 设备信息
    ip_address TEXT,
    user_agent TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT,
    duration_seconds INTEGER GENERATED ALWAYS AS (
        CASE WHEN ended_at IS NOT NULL
        THEN CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER)
        ELSE NULL END
    ) STORED,
    is_active BOOLEAN DEFAULT TRUE
);

-- ============================================================================
-- 行为分析表：用户行为数据
-- ============================================================================

-- 用户行为事件表（核心行为数据）
CREATE TABLE IF NOT EXISTS user_events (
    event_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    session_id TEXT REFERENCES user_sessions(session_id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'page_view', 'click', 'search', 'read', etc.
    category TEXT, -- 'content', 'navigation', 'interaction', etc.
    target_id TEXT, -- 目标对象ID（如book_id, chapter_id）
    target_type TEXT, -- 目标对象类型
    properties TEXT, -- JSON 事件属性
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    url TEXT,
    referrer TEXT
);

-- 搜索历史表
CREATE TABLE IF NOT EXISTS search_history (
    search_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    filters TEXT, -- JSON 搜索过滤条件
    result_count INTEGER DEFAULT 0,
    selected_result TEXT, -- 用户选择的第一个结果
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER -- 搜索耗时
);

-- 阅读进度表（优化后的设计）
CREATE TABLE IF NOT EXISTS reading_progress (
    progress_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    book_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    position_percent REAL DEFAULT 0 CHECK (position_percent >= 0 AND position_percent <= 100),
    position_words INTEGER DEFAULT 0,
    scroll_position INTEGER DEFAULT 0,
    reading_time_seconds INTEGER DEFAULT 0,
    last_read_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed BOOLEAN DEFAULT FALSE,
    notes TEXT, -- JSON 阅读笔记
    bookmarks TEXT, -- JSON 书签列表
    UNIQUE(user_id, book_id, chapter_id)
);

-- ============================================================================
-- 内容管理表：书籍和章节数据
-- ============================================================================

-- 书籍元数据表
CREATE TABLE IF NOT EXISTS books (
    book_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    genres TEXT, -- JSON 分类数组
    tags TEXT, -- JSON 标签数组
    word_count INTEGER,
    chapter_count INTEGER,
    status TEXT DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'completed', 'hiatus')),
    rating REAL CHECK (rating >= 0 AND rating <= 5),
    publish_date TEXT,
    update_date TEXT,
    source_url TEXT,
    metadata TEXT, -- JSON 额外元数据
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 章节元数据表
CREATE TABLE IF NOT EXISTS chapters (
    chapter_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    word_count INTEGER,
    publish_date TEXT,
    update_date TEXT,
    is_vip BOOLEAN DEFAULT FALSE,
    content_hash TEXT, -- 内容哈希，用于缓存验证
    metadata TEXT, -- JSON 额外元数据
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 内容统计表
CREATE TABLE IF NOT EXISTS content_stats (
    stat_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    content_type TEXT NOT NULL, -- 'book', 'chapter', 'author'
    content_id TEXT NOT NULL,
    metric_name TEXT NOT NULL, -- 'views', 'reads', 'likes', 'shares'
    metric_value INTEGER DEFAULT 0,
    date TEXT NOT NULL, -- YYYY-MM-DD 格式
    UNIQUE(content_type, content_id, metric_name, date)
);

-- ============================================================================
-- 推荐系统表：个性化推荐数据
-- ============================================================================

-- 推荐历史表
CREATE TABLE IF NOT EXISTS recommendation_history (
    rec_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    algorithm TEXT NOT NULL, -- 'collaborative', 'content_based', 'trending'
    content_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    score REAL NOT NULL,
    position INTEGER, -- 在推荐列表中的位置
    was_clicked BOOLEAN DEFAULT FALSE,
    was_viewed BOOLEAN DEFAULT FALSE,
    was_read BOOLEAN DEFAULT FALSE,
    reading_time_seconds INTEGER DEFAULT 0,
    context TEXT, -- JSON 推荐上下文
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 用户兴趣模型表
CREATE TABLE IF NOT EXISTS user_interests (
    interest_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- 'genre', 'author', 'tag'
    item TEXT NOT NULL, -- 具体项目
    score REAL DEFAULT 0, -- 兴趣度评分
    confidence REAL DEFAULT 0, -- 置信度
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category, item)
);

-- ============================================================================
-- 系统监控表：性能和错误数据
-- ============================================================================

-- 性能指标表
CREATE TABLE IF NOT EXISTS performance_metrics (
    metric_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    unit TEXT,
    tags TEXT, -- JSON 标签
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    source TEXT -- 指标来源
);

-- 错误日志表
CREATE TABLE IF NOT EXISTS error_logs (
    error_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
    session_id TEXT,
    url TEXT,
    user_agent TEXT,
    ip_address TEXT,
    request_id TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    severity TEXT DEFAULT 'error' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical'))
);

-- API使用统计表
CREATE TABLE IF NOT EXISTS api_usage (
    usage_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT
);

-- ============================================================================
-- 索引优化（针对D1的查询模式）
-- ============================================================================

-- 用户相关索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);

-- 会话相关索引
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON user_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sessions_started ON user_sessions(started_at DESC);

-- 事件相关索引（复合索引优化查询）
CREATE INDEX IF NOT EXISTS idx_events_user_time ON user_events(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON user_events(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON user_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_target ON user_events(target_type, target_id);

-- 搜索历史索引
CREATE INDEX IF NOT EXISTS idx_search_user_time ON search_history(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_search_query ON search_history(query);

-- 阅读进度索引
CREATE INDEX IF NOT EXISTS idx_progress_user ON reading_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_book ON reading_progress(book_id);
CREATE INDEX IF NOT EXISTS idx_progress_chapter ON reading_progress(chapter_id);
CREATE INDEX IF NOT EXISTS idx_progress_last_read ON reading_progress(last_read_at DESC);

-- 书籍相关索引
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_books_updated ON books(update_date DESC);
CREATE INDEX IF NOT EXISTS idx_books_rating ON books(rating DESC) WHERE rating IS NOT NULL;

-- 章节相关索引
CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_chapters_number ON chapters(book_id, number);
CREATE INDEX IF NOT EXISTS idx_chapters_updated ON chapters(update_date DESC);

-- 内容统计索引
CREATE INDEX IF NOT EXISTS idx_stats_content ON content_stats(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_stats_date ON content_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_stats_metric ON content_stats(metric_name, date DESC);

-- 推荐相关索引
CREATE INDEX IF NOT EXISTS idx_rec_user_time ON recommendation_history(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rec_content ON recommendation_history(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_rec_algorithm ON recommendation_history(algorithm, score DESC);

-- 兴趣模型索引
CREATE INDEX IF NOT EXISTS idx_interests_user ON user_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_interests_category ON user_interests(category, score DESC);

-- 性能指标索引
CREATE INDEX IF NOT EXISTS idx_metrics_name_time ON performance_metrics(metric_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_source ON performance_metrics(source);

-- 错误日志索引
CREATE INDEX IF NOT EXISTS idx_errors_type_time ON error_logs(error_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_errors_user ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_errors_severity ON error_logs(severity);

-- API使用索引
CREATE INDEX IF NOT EXISTS idx_api_user_time ON api_usage(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_endpoint ON api_usage(endpoint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_status ON api_usage(status_code);

-- ============================================================================
-- 视图和优化查询
-- ============================================================================

-- 用户活跃度视图
CREATE VIEW IF NOT EXISTS user_activity_summary AS
SELECT
    u.user_id,
    u.username,
    u.display_name,
    COUNT(DISTINCT DATE(ue.timestamp)) as active_days_30d,
    COUNT(ue.event_id) as total_events_30d,
    MAX(ue.timestamp) as last_activity,
    AVG(CASE WHEN ue.event_type = 'read_time'
             THEN json_extract(ue.properties, '$.duration')
             ELSE NULL END) as avg_reading_time
FROM users u
LEFT JOIN user_events ue ON u.user_id = ue.user_id
    AND ue.timestamp >= datetime('now', '-30 days')
GROUP BY u.user_id, u.username, u.display_name;

-- 热门内容视图
CREATE VIEW IF NOT EXISTS popular_content AS
SELECT
    content_type,
    content_id,
    SUM(CASE WHEN metric_name = 'views' THEN metric_value ELSE 0 END) as total_views,
    SUM(CASE WHEN metric_name = 'reads' THEN metric_value ELSE 0 END) as total_reads,
    SUM(CASE WHEN metric_name = 'likes' THEN metric_value ELSE 0 END) as total_likes,
    AVG(CASE WHEN metric_name = 'rating' THEN metric_value ELSE NULL END) as avg_rating,
    (
        SUM(CASE WHEN metric_name = 'views' THEN metric_value ELSE 0 END) * 0.3 +
        SUM(CASE WHEN metric_name = 'reads' THEN metric_value ELSE 0 END) * 0.4 +
        SUM(CASE WHEN metric_name = 'likes' THEN metric_value ELSE 0 END) * 0.3
    ) as popularity_score
FROM content_stats
WHERE date >= date('now', '-30 days')
GROUP BY content_type, content_id
HAVING total_views > 0
ORDER BY popularity_score DESC;

-- 用户兴趣视图
CREATE VIEW IF NOT EXISTS user_reading_preferences AS
SELECT
    ui.user_id,
    ui.category,
    ui.item,
    ui.score as interest_score,
    COUNT(ue.event_id) as recent_activity,
    MAX(ue.timestamp) as last_interaction
FROM user_interests ui
LEFT JOIN user_events ue ON ui.user_id = ue.user_id
    AND ue.target_type = ui.category
    AND ue.target_id = ui.item
    AND ue.timestamp >= datetime('now', '-7 days')
GROUP BY ui.user_id, ui.category, ui.item, ui.score
ORDER BY ui.user_id, ui.score DESC;

-- ============================================================================
-- 触发器：自动维护数据一致性
-- ============================================================================

-- 更新用户最后登录时间
CREATE TRIGGER IF NOT EXISTS update_user_last_login
    AFTER INSERT ON user_sessions
BEGIN
    UPDATE users
    SET last_login_at = NEW.started_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id;
END;

-- 自动更新书籍统计
CREATE TRIGGER IF NOT EXISTS update_book_stats_on_read
    AFTER INSERT ON reading_progress
    WHEN NEW.completed = TRUE
BEGIN
    INSERT OR REPLACE INTO content_stats (content_type, content_id, metric_name, date, metric_value)
    VALUES ('book', NEW.book_id, 'completed_reads',
            date('now'),
            COALESCE((SELECT metric_value + 1 FROM content_stats
                     WHERE content_type = 'book' AND content_id = NEW.book_id
                     AND metric_name = 'completed_reads' AND date = date('now')), 1));
END;

-- 自动更新章节统计
CREATE TRIGGER IF NOT EXISTS update_chapter_stats_on_view
    AFTER INSERT ON user_events
    WHEN NEW.event_type = 'chapter_view'
BEGIN
    INSERT OR REPLACE INTO content_stats (content_type, content_id, metric_name, date, metric_value)
    VALUES ('chapter', NEW.target_id, 'views',
            date('now'),
            COALESCE((SELECT metric_value + 1 FROM content_stats
                     WHERE content_type = 'chapter' AND content_id = NEW.target_id
                     AND metric_name = 'views' AND date = date('now')), 1));
END;

-- ============================================================================
-- 初始化数据
-- ============================================================================

-- 初始化系统指标
INSERT OR IGNORE INTO performance_metrics (metric_name, metric_value, unit, source, timestamp)
VALUES ('system_init', 1, 'count', 'database', CURRENT_TIMESTAMP);

-- 创建示例用户（可选）
INSERT OR IGNORE INTO users (user_id, username, display_name, status)
VALUES ('system', 'system', 'System User', 'active');

-- ============================================================================
-- 定期清理任务（建议通过外部调度执行）
-- ============================================================================

-- 清理过期会话（保留30天）
-- DELETE FROM user_sessions WHERE started_at < datetime('now', '-30 days');

-- 清理旧的事件数据（保留90天）
-- DELETE FROM user_events WHERE timestamp < datetime('now', '-90 days');

-- 清理旧的搜索历史（保留180天）
-- DELETE FROM search_history WHERE timestamp < datetime('now', '-180 days');

-- 清理旧的API使用记录（保留30天）
-- DELETE FROM api_usage WHERE timestamp < datetime('now', '-30 days');

-- 清理旧的性能指标（保留7天）
-- DELETE FROM performance_metrics WHERE timestamp < datetime('now', '-7 days');

-- 清理旧的错误日志（保留30天）
-- DELETE FROM error_logs WHERE timestamp < datetime('now', '-30 days') AND severity != 'critical';