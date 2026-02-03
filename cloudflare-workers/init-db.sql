-- Nexus Reader D1 Database Schema
-- 免费SQLite数据库，500k reads/month, 50k writes/month, 1GB storage

-- 用户行为分析表
CREATE TABLE IF NOT EXISTS user_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    data TEXT, -- JSON data
    timestamp TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    session_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_user_actions_user_id ON user_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_action ON user_actions(action);
CREATE INDEX IF NOT EXISTS idx_user_actions_timestamp ON user_actions(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_actions_session ON user_actions(session_id);

-- 用户偏好设置表
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    preferences TEXT NOT NULL, -- JSON preferences
    updated_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 内容统计表
CREATE TABLE IF NOT EXISTS content_stats (
    content_id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL, -- 'book', 'chapter', etc.
    title TEXT,
    author TEXT,
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    read_time_avg REAL DEFAULT 0, -- 平均阅读时间(秒)
    completion_rate REAL DEFAULT 0, -- 完成率
    popularity_score REAL DEFAULT 0,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_stats_type ON content_stats(content_type);
CREATE INDEX IF NOT EXISTS idx_content_stats_popularity ON content_stats(popularity_score DESC);

-- 用户会话表
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration INTEGER, -- 持续时间(毫秒)
    device_info TEXT, -- JSON device info
    page_views INTEGER DEFAULT 0,
    actions_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_start_time ON user_sessions(start_time);

-- 推荐历史表
CREATE TABLE IF NOT EXISTS recommendation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    score REAL NOT NULL,
    position INTEGER,
    clicked BOOLEAN DEFAULT FALSE,
    viewed BOOLEAN DEFAULT FALSE,
    read_time INTEGER DEFAULT 0, -- 阅读时间(秒)
    timestamp TEXT NOT NULL,
    context TEXT -- JSON context data
);

CREATE INDEX IF NOT EXISTS idx_recommendation_history_user ON recommendation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_history_content ON recommendation_history(content_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_history_timestamp ON recommendation_history(timestamp);

-- 系统指标表
CREATE TABLE IF NOT EXISTS system_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT,
    tags TEXT, -- JSON tags
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp);

-- 错误日志表
CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    error_type TEXT NOT NULL,
    message TEXT NOT NULL,
    stack_trace TEXT,
    user_id TEXT,
    session_id TEXT,
    url TEXT,
    user_agent TEXT,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp);

-- 备份记录表
CREATE TABLE IF NOT EXISTS backup_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    backup_type TEXT NOT NULL, -- 'preferences', 'full', 'content'
    backup_key TEXT NOT NULL, -- R2 key
    size_bytes INTEGER,
    status TEXT DEFAULT 'completed',
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_records_user ON backup_records(user_id);
CREATE INDEX IF NOT EXISTS idx_backup_records_timestamp ON backup_records(timestamp);

-- 触发器：自动更新时间戳
CREATE TRIGGER IF NOT EXISTS update_user_preferences_timestamp
    AFTER UPDATE ON user_preferences
BEGIN
    UPDATE user_preferences SET updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS update_content_stats_timestamp
    AFTER UPDATE ON content_stats
BEGIN
    UPDATE content_stats SET last_updated = CURRENT_TIMESTAMP WHERE content_id = NEW.content_id;
END;

-- 视图：热门内容
CREATE VIEW IF NOT EXISTS popular_content AS
SELECT
    content_id,
    title,
    author,
    view_count,
    popularity_score,
    (view_count * 0.4 + popularity_score * 0.6) as weighted_score
FROM content_stats
WHERE view_count > 10
ORDER BY weighted_score DESC;

-- 视图：用户活跃度
CREATE VIEW IF NOT EXISTS user_activity AS
SELECT
    user_id,
    COUNT(DISTINCT DATE(timestamp)) as active_days,
    COUNT(*) as total_actions,
    AVG(CASE WHEN action = 'read_time' THEN CAST(data AS REAL) ELSE NULL END) as avg_read_time,
    MAX(timestamp) as last_activity
FROM user_actions
WHERE timestamp > datetime('now', '-30 days')
GROUP BY user_id
HAVING total_actions > 5
ORDER BY total_actions DESC;

-- 初始化数据
INSERT OR IGNORE INTO system_metrics (metric_name, value, unit, timestamp)
VALUES ('system_init', 1, 'count', CURRENT_TIMESTAMP);

-- 预编译的常用查询（提升性能）
-- 注意：D1支持prepared statements，但这里定义一些常用的SQL模式