//! 用户领域 (User Domain)
//!
//! 用户领域负责处理用户管理、偏好设置、权限控制等相关业务逻辑。
//! 该领域包含以下核心概念：
//! - 用户(User): 系统用户实体
//! - 用户偏好(UserPreferences): 用户个性化设置
//! - 权限(Permission): 用户权限控制
//! - 用户会话(UserSession): 用户登录状态

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::domain::*;
use crate::error::EngineError;

/// 用户实体 - 聚合根
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: UserId,
    pub username: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub status: UserStatus,
    pub role: UserRole,
    pub preferences: UserPreferences,
    pub profile: UserProfile,
    pub security_info: SecurityInfo,
    pub version: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
    #[serde(skip)]
    pub uncommitted_events: Vec<DomainEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct UserId(pub String);

impl fmt::Display for UserId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UserStatus {
    Active,
    Inactive,
    Suspended,
    Deleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UserRole {
    Reader,
    PremiumReader,
    Moderator,
    Administrator,
}

#[async_trait]
impl Entity for User {
    type Id = UserId;

    fn id(&self) -> &Self::Id {
        &self.id
    }

    fn is_new(&self) -> bool {
        self.version == 0
    }

    fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }

    fn updated_at(&self) -> DateTime<Utc> {
        self.updated_at
    }
}

#[async_trait]
impl AggregateRoot for User {
    fn version(&self) -> u64 {
        self.version
    }

    fn increment_version(&mut self) {
        self.version += 1;
        self.updated_at = Utc::now();
    }

    fn uncommitted_events(&self) -> Vec<DomainEvent> {
        self.uncommitted_events.clone()
    }

    fn clear_uncommitted_events(&mut self) {
        self.uncommitted_events.clear();
    }
}

impl User {
    /// 创建新用户
    pub fn new(id: UserId, username: String, email: String) -> Self {
        let now = Utc::now();
        Self {
            id,
            username,
            email,
            display_name: None,
            avatar_url: None,
            status: UserStatus::Active,
            role: UserRole::Reader,
            preferences: UserPreferences::default(),
            profile: UserProfile::default(),
            security_info: SecurityInfo::default(),
            version: 0,
            created_at: now,
            updated_at: now,
            last_login_at: None,
            uncommitted_events: vec![DomainEvent::User(UserEvent::UserCreated {
                user_id: id.0.clone(),
                username: username.clone(),
                email: email.clone(),
            })],
        }
    }

    /// 更新用户信息
    pub fn update_profile(&mut self, display_name: Option<String>, avatar_url: Option<String>) {
        self.display_name = display_name;
        self.avatar_url = avatar_url;
        self.increment_version();

        self.uncommitted_events.push(DomainEvent::User(UserEvent::UserProfileUpdated {
            user_id: self.id.0.clone(),
        }));
    }

    /// 更新用户偏好
    pub fn update_preferences(&mut self, preferences: UserPreferences) {
        self.preferences = preferences;
        self.increment_version();

        self.uncommitted_events.push(DomainEvent::User(UserEvent::UserPreferencesUpdated {
            user_id: self.id.0.clone(),
        }));
    }

    /// 记录登录
    pub fn record_login(&mut self) {
        self.last_login_at = Some(Utc::now());
        self.increment_version();

        self.uncommitted_events.push(DomainEvent::User(UserEvent::UserLoggedIn {
            user_id: self.id.0.clone(),
        }));
    }

    /// 更改用户状态
    pub fn change_status(&mut self, status: UserStatus) {
        if self.status != status {
            let old_status = self.status.clone();
            self.status = status.clone();
            self.increment_version();

            self.uncommitted_events.push(DomainEvent::User(UserEvent::UserStatusChanged {
                user_id: self.id.0.clone(),
                old_status: format!("{:?}", old_status),
                new_status: format!("{:?}", status),
            }));
        }
    }

    /// 升级用户角色
    pub fn upgrade_role(&mut self, role: UserRole) {
        if self.role != role {
            let old_role = self.role.clone();
            self.role = role.clone();
            self.increment_version();

            self.uncommitted_events.push(DomainEvent::User(UserEvent::UserRoleChanged {
                user_id: self.id.0.clone(),
                old_role: format!("{:?}", old_role),
                new_role: format!("{:?}", role),
            }));
        }
    }

    /// 验证用户是否有权限
    pub fn has_permission(&self, permission: &Permission) -> bool {
        match (&self.role, permission) {
            (UserRole::Administrator, _) => true,
            (UserRole::Moderator, Permission::Read) => true,
            (UserRole::Moderator, Permission::Write) => true,
            (UserRole::PremiumReader, Permission::Read) => true,
            (UserRole::PremiumReader, Permission::PremiumFeature) => true,
            (UserRole::Reader, Permission::Read) => true,
            _ => false,
        }
    }
}

/// 用户偏好值对象
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    pub theme: Theme,
    pub language: String,
    pub timezone: String,
    pub reading_settings: ReadingSettings,
    pub notification_settings: NotificationSettings,
    pub privacy_settings: PrivacySettings,
    pub metadata: HashMap<String, serde_json::Value>,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            theme: Theme::Light,
            language: "zh-CN".to_string(),
            timezone: "Asia/Shanghai".to_string(),
            reading_settings: ReadingSettings::default(),
            notification_settings: NotificationSettings::default(),
            privacy_settings: PrivacySettings::default(),
            metadata: HashMap::new(),
        }
    }
}

impl ValueObject for UserPreferences {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Theme {
    Light,
    Dark,
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingSettings {
    pub font_size: u32,
    pub font_family: String,
    pub line_height: f32,
    pub page_width: u32,
    pub auto_scroll: bool,
    pub scroll_speed: u32,
    pub night_mode: bool,
}

impl Default for ReadingSettings {
    fn default() -> Self {
        Self {
            font_size: 16,
            font_family: "default".to_string(),
            line_height: 1.5,
            page_width: 800,
            auto_scroll: false,
            scroll_speed: 50,
            night_mode: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationSettings {
    pub email_notifications: bool,
    pub push_notifications: bool,
    pub reading_reminders: bool,
    pub new_book_alerts: bool,
    pub recommendation_notifications: bool,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            email_notifications: true,
            push_notifications: true,
            reading_reminders: true,
            new_book_alerts: true,
            recommendation_notifications: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacySettings {
    pub profile_visibility: Visibility,
    pub reading_history_visibility: Visibility,
    pub statistics_visibility: Visibility,
    pub allow_data_collection: bool,
}

impl Default for PrivacySettings {
    fn default() -> Self {
        Self {
            profile_visibility: Visibility::Public,
            reading_history_visibility: Visibility::Friends,
            statistics_visibility: Visibility::Private,
            allow_data_collection: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Visibility {
    Public,
    Friends,
    Private,
}

/// 用户资料值对象
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub bio: Option<String>,
    pub location: Option<String>,
    pub website: Option<String>,
    pub birth_date: Option<DateTime<Utc>>,
    pub gender: Option<Gender>,
    pub interests: Vec<String>,
    pub favorite_genres: Vec<String>,
    pub favorite_authors: Vec<String>,
    pub reading_goal: Option<ReadingGoal>,
    pub social_links: HashMap<String, String>,
}

impl Default for UserProfile {
    fn default() -> Self {
        Self {
            bio: None,
            location: None,
            website: None,
            birth_date: None,
            gender: None,
            interests: Vec::new(),
            favorite_genres: Vec::new(),
            favorite_authors: Vec::new(),
            reading_goal: None,
            social_links: HashMap::new(),
        }
    }
}

impl ValueObject for UserProfile {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Gender {
    Male,
    Female,
    Other,
    PreferNotToSay,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingGoal {
    pub books_per_year: u32,
    pub pages_per_day: u32,
    pub current_year_progress: u32,
    pub streak_days: u32,
}

/// 安全信息值对象
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityInfo {
    pub password_hash: String,
    pub password_updated_at: DateTime<Utc>,
    pub two_factor_enabled: bool,
    pub two_factor_secret: Option<String>,
    pub login_attempts: u32,
    pub last_failed_login: Option<DateTime<Utc>>,
    pub account_locked_until: Option<DateTime<Utc>>,
    pub security_questions: Vec<SecurityQuestion>,
}

impl Default for SecurityInfo {
    fn default() -> Self {
        Self {
            password_hash: "".to_string(),
            password_updated_at: Utc::now(),
            two_factor_enabled: false,
            two_factor_secret: None,
            login_attempts: 0,
            last_failed_login: None,
            account_locked_until: None,
            security_questions: Vec::new(),
        }
    }
}

impl ValueObject for SecurityInfo {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityQuestion {
    pub question: String,
    pub answer_hash: String,
}

/// 权限枚举
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Permission {
    Read,
    Write,
    Delete,
    Admin,
    PremiumFeature,
}

/// 用户会话实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    pub id: UserSessionId,
    pub user_id: UserId,
    pub device_info: DeviceInfo,
    pub ip_address: String,
    pub user_agent: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub is_active: bool,
    pub metadata: HashMap<String, serde_json::Value>,
    pub version: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct UserSessionId(pub String);

#[async_trait]
impl Entity for UserSession {
    type Id = UserSessionId;

    fn id(&self) -> &Self::Id {
        &self.id
    }

    fn is_new(&self) -> bool {
        self.version == 0
    }

    fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }

    fn updated_at(&self) -> DateTime<Utc> {
        self.updated_at
    }
}

/// 用户领域事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UserEvent {
    UserCreated {
        user_id: String,
        username: String,
        email: String,
    },
    UserProfileUpdated {
        user_id: String,
    },
    UserPreferencesUpdated {
        user_id: String,
    },
    UserLoggedIn {
        user_id: String,
    },
    UserLoggedOut {
        user_id: String,
    },
    UserStatusChanged {
        user_id: String,
        old_status: String,
        new_status: String,
    },
    UserRoleChanged {
        user_id: String,
        old_role: String,
        new_role: String,
    },
    UserPasswordChanged {
        user_id: String,
    },
    UserSessionCreated {
        session_id: String,
        user_id: String,
    },
    UserSessionExpired {
        session_id: String,
        user_id: String,
    },
}

/// 用户领域命令
#[derive(Debug, Clone)]
pub enum UserCommand {
    CreateUser {
        user_id: String,
        username: String,
        email: String,
        password_hash: String,
    },
    UpdateUserProfile {
        user_id: String,
        display_name: Option<String>,
        avatar_url: Option<String>,
        profile: UserProfile,
    },
    UpdateUserPreferences {
        user_id: String,
        preferences: UserPreferences,
    },
    ChangeUserPassword {
        user_id: String,
        new_password_hash: String,
    },
    ChangeUserStatus {
        user_id: String,
        status: UserStatus,
    },
    UpgradeUserRole {
        user_id: String,
        role: UserRole,
    },
    CreateUserSession {
        user_id: String,
        device_info: DeviceInfo,
        ip_address: String,
        user_agent: String,
    },
    EndUserSession {
        session_id: String,
    },
    AuthenticateUser {
        username_or_email: String,
        password_hash: String,
    },
}

/// 用户领域查询
#[derive(Debug, Clone)]
pub enum UserQuery {
    GetUser {
        user_id: String,
    },
    GetUserByUsername {
        username: String,
    },
    GetUserByEmail {
        email: String,
    },
    GetUserProfile {
        user_id: String,
    },
    GetUserPreferences {
        user_id: String,
    },
    GetUserSessions {
        user_id: String,
        active_only: bool,
        limit: Option<u32>,
    },
    GetUserStatistics {
        user_id: String,
    },
    ListUsers {
        status: Option<UserStatus>,
        role: Option<UserRole>,
        limit: Option<u32>,
        offset: Option<u32>,
    },
}

/// 用户领域 - 聚合所有用户相关业务逻辑
pub struct UserDomain {
    user_repository: Box<dyn UserRepository>,
    session_repository: Box<dyn UserSessionRepository>,
    authentication_service: Box<dyn AuthenticationService>,
    authorization_service: Box<dyn AuthorizationService>,
    business_rules: Vec<Box<dyn BusinessRuleValidator<User>>>,
}

impl UserDomain {
    pub async fn new() -> Result<Self, DomainError> {
        Ok(Self {
            user_repository: Box::new(InMemoryUserRepository::new()),
            session_repository: Box::new(InMemoryUserSessionRepository::new()),
            authentication_service: Box::new(BasicAuthenticationService::new()),
            authorization_service: Box::new(RBACAuthorizationService::new()),
            business_rules: vec![
                Box::new(UserEmailValidRule),
                Box::new(UsernameNotEmptyRule),
                Box::new(UsernameUniqueRule::new()),
            ],
        })
    }

    pub async fn handle_command(&self, command: UserCommand) -> Result<DomainResult, DomainError> {
        match command {
            UserCommand::CreateUser { user_id, username, email, password_hash } => {
                self.create_user(user_id, username, email, password_hash).await
            }
            UserCommand::UpdateUserProfile { user_id, display_name, avatar_url, profile } => {
                self.update_user_profile(user_id, display_name, avatar_url, profile).await
            }
            UserCommand::UpdateUserPreferences { user_id, preferences } => {
                self.update_user_preferences(user_id, preferences).await
            }
            UserCommand::ChangeUserPassword { user_id, new_password_hash } => {
                self.change_user_password(user_id, new_password_hash).await
            }
            UserCommand::ChangeUserStatus { user_id, status } => {
                self.change_user_status(user_id, status).await
            }
            UserCommand::UpgradeUserRole { user_id, role } => {
                self.upgrade_user_role(user_id, role).await
            }
            UserCommand::CreateUserSession { user_id, device_info, ip_address, user_agent } => {
                self.create_user_session(user_id, device_info, ip_address, user_agent).await
            }
            UserCommand::EndUserSession { session_id } => {
                self.end_user_session(session_id).await
            }
            UserCommand::AuthenticateUser { username_or_email, password_hash } => {
                self.authenticate_user(username_or_email, password_hash).await
            }
        }
    }

    pub async fn handle_query(&self, query: UserQuery) -> Result<DomainResult, DomainError> {
        match query {
            UserQuery::GetUser { user_id } => {
                self.get_user(user_id).await
            }
            UserQuery::GetUserByUsername { username } => {
                self.get_user_by_username(username).await
            }
            UserQuery::GetUserByEmail { email } => {
                self.get_user_by_email(email).await
            }
            UserQuery::GetUserProfile { user_id } => {
                self.get_user_profile(user_id).await
            }
            UserQuery::GetUserPreferences { user_id } => {
                self.get_user_preferences(user_id).await
            }
            UserQuery::GetUserSessions { user_id, active_only, limit } => {
                self.get_user_sessions(user_id, active_only, limit).await
            }
            UserQuery::GetUserStatistics { user_id } => {
                self.get_user_statistics(user_id).await
            }
            UserQuery::ListUsers { status, role, limit, offset } => {
                self.list_users(status, role, limit, offset).await
            }
        }
    }

    async fn create_user(
        &self,
        user_id: String,
        username: String,
        email: String,
        password_hash: String,
    ) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let mut user = User::new(user_id.clone(), username, email.clone());

        // 设置密码
        user.security_info.password_hash = password_hash;
        user.security_info.password_updated_at = Utc::now();

        // 验证业务规则
        for rule in &self.business_rules {
            rule.validate(&user, &DomainContext::default()).await?;
        }

        // 保存用户
        self.user_repository.save(&user).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&user).unwrap()),
            events: user.uncommitted_events.clone(),
            metadata: HashMap::new(),
        })
    }

    async fn update_user_profile(
        &self,
        user_id: String,
        display_name: Option<String>,
        avatar_url: Option<String>,
        profile: UserProfile,
    ) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let mut user = self.user_repository.find_by_id(&user_id).await?
            .ok_or_else(|| DomainError::NotFound(format!("User {} not found", user_id.0)))?;

        user.update_profile(display_name, avatar_url);
        user.profile = profile;
        self.user_repository.save(&user).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&user).unwrap()),
            events: user.uncommitted_events.clone(),
            metadata: HashMap::new(),
        })
    }

    async fn update_user_preferences(&self, user_id: String, preferences: UserPreferences) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let mut user = self.user_repository.find_by_id(&user_id).await?
            .ok_or_else(|| DomainError::NotFound(format!("User {} not found", user_id.0)))?;

        user.update_preferences(preferences);
        self.user_repository.save(&user).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&user).unwrap()),
            events: user.uncommitted_events.clone(),
            metadata: HashMap::new(),
        })
    }

    async fn change_user_password(&self, user_id: String, new_password_hash: String) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let mut user = self.user_repository.find_by_id(&user_id).await?
            .ok_or_else(|| DomainError::NotFound(format!("User {} not found", user_id.0)))?;

        user.security_info.password_hash = new_password_hash;
        user.security_info.password_updated_at = Utc::now();
        user.increment_version();

        user.uncommitted_events.push(DomainEvent::User(UserEvent::UserPasswordChanged {
            user_id: user_id.0,
        }));

        self.user_repository.save(&user).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&user).unwrap()),
            events: user.uncommitted_events.clone(),
            metadata: HashMap::new(),
        })
    }

    async fn change_user_status(&self, user_id: String, status: UserStatus) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let mut user = self.user_repository.find_by_id(&user_id).await?
            .ok_or_else(|| DomainError::NotFound(format!("User {} not found", user_id.0)))?;

        user.change_status(status);
        self.user_repository.save(&user).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&user).unwrap()),
            events: user.uncommitted_events.clone(),
            metadata: HashMap::new(),
        })
    }

    async fn upgrade_user_role(&self, user_id: String, role: UserRole) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let mut user = self.user_repository.find_by_id(&user_id).await?
            .ok_or_else(|| DomainError::NotFound(format!("User {} not found", user_id.0)))?;

        user.upgrade_role(role);
        self.user_repository.save(&user).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&user).unwrap()),
            events: user.uncommitted_events.clone(),
            metadata: HashMap::new(),
        })
    }

    async fn create_user_session(
        &self,
        user_id: String,
        device_info: DeviceInfo,
        ip_address: String,
        user_agent: String,
    ) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let session_id = UserSessionId(Uuid::new_v4().to_string());
        let session = UserSession {
            id: session_id.clone(),
            user_id: user_id.clone(),
            device_info,
            ip_address,
            user_agent,
            started_at: Utc::now(),
            ended_at: None,
            is_active: true,
            metadata: HashMap::new(),
            version: 0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.session_repository.save(&session).await?;

        // 更新用户最后登录时间
        let mut user = self.user_repository.find_by_id(&user_id).await?
            .ok_or_else(|| DomainError::NotFound(format!("User {} not found", user_id.0)))?;
        user.record_login();
        self.user_repository.save(&user).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&session).unwrap()),
            events: vec![
                DomainEvent::User(UserEvent::UserSessionCreated {
                    session_id: session_id.0,
                    user_id: user_id.0,
                }),
                DomainEvent::User(UserEvent::UserLoggedIn {
                    user_id: user_id.0,
                }),
            ],
            metadata: HashMap::new(),
        })
    }

    async fn end_user_session(&self, session_id: String) -> Result<DomainResult, DomainError> {
        let session_id = UserSessionId(session_id);
        let mut session = self.session_repository.find_by_id(&session_id).await?
            .ok_or_else(|| DomainError::NotFound(format!("Session {} not found", session_id.0)))?;

        session.ended_at = Some(Utc::now());
        session.is_active = false;
        self.session_repository.save(&session).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&session).unwrap()),
            events: vec![DomainEvent::User(UserEvent::UserSessionExpired {
                session_id: session_id.0,
                user_id: session.user_id.0,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn authenticate_user(&self, username_or_email: String, password_hash: String) -> Result<DomainResult, DomainError> {
        let user = if username_or_email.contains('@') {
            self.user_repository.find_by_email(&username_or_email).await?
        } else {
            self.user_repository.find_by_username(&username_or_email).await?
        };

        match user {
            Some(user) if user.security_info.password_hash == password_hash => {
                Ok(DomainResult {
                    success: true,
                    data: Some(serde_json::json!({
                        "user_id": user.id.0,
                        "username": user.username,
                        "role": user.role,
                        "status": user.status
                    })),
                    events: vec![DomainEvent::User(UserEvent::UserLoggedIn {
                        user_id: user.id.0,
                    })],
                    metadata: HashMap::from([
                        ("authenticated".to_string(), serde_json::json!(true)),
                    ]),
                })
            }
            _ => Err(DomainError::Unauthorized("Invalid credentials".to_string())),
        }
    }

    async fn get_user(&self, user_id: String) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let user = self.user_repository.find_by_id(&user_id).await?
            .ok_or_else(|| DomainError::NotFound(format!("User {} not found", user_id.0)))?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&user).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_user_by_username(&self, username: String) -> Result<DomainResult, DomainError> {
        let user = self.user_repository.find_by_username(&username).await?
            .ok_or_else(|| DomainError::NotFound(format!("User with username {} not found", username)))?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&user).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_user_by_email(&self, email: String) -> Result<DomainResult, DomainError> {
        let user = self.user_repository.find_by_email(&email).await?
            .ok_or_else(|| DomainError::NotFound(format!("User with email {} not found", email)))?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&user).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_user_profile(&self, user_id: String) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let user = self.user_repository.find_by_id(&user_id).await?
            .ok_or_else(|| DomainError::NotFound(format!("User {} not found", user_id.0)))?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&user.profile).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_user_preferences(&self, user_id: String) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let user = self.user_repository.find_by_id(&user_id).await?
            .ok_or_else(|| DomainError::NotFound(format!("User {} not found", user_id.0)))?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&user.preferences).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_user_sessions(&self, user_id: String, active_only: bool, limit: Option<u32>) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let sessions = self.session_repository.find_by_user(&user_id, active_only, limit.unwrap_or(20)).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(sessions)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_user_statistics(&self, user_id: String) -> Result<DomainResult, DomainError> {
        let user_id = UserId(user_id);
        let stats = self.session_repository.get_user_statistics(&user_id).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(stats).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn list_users(&self, status: Option<UserStatus>, role: Option<UserRole>, limit: Option<u32>, offset: Option<u32>) -> Result<DomainResult, DomainError> {
        let users = self.user_repository.list_users(status, role, limit.unwrap_or(50), offset.unwrap_or(0)).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(users)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }
}

// ===== 仓库接口 =====

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn save(&self, user: &User) -> Result<(), DomainError>;
    async fn find_by_id(&self, id: &UserId) -> Result<Option<User>, DomainError>;
    async fn find_by_username(&self, username: &str) -> Result<Option<User>, DomainError>;
    async fn find_by_email(&self, email: &str) -> Result<Option<User>, DomainError>;
    async fn list_users(&self, status: Option<UserStatus>, role: Option<UserRole>, limit: u32, offset: u32) -> Result<Vec<User>, DomainError>;
}

#[async_trait]
pub trait UserSessionRepository: Send + Sync {
    async fn save(&self, session: &UserSession) -> Result<(), DomainError>;
    async fn find_by_id(&self, id: &UserSessionId) -> Result<Option<UserSession>, DomainError>;
    async fn find_by_user(&self, user_id: &UserId, active_only: bool, limit: u32) -> Result<Vec<UserSession>, DomainError>;
    async fn get_user_statistics(&self, user_id: &UserId) -> Result<UserStatistics, DomainError>;
}

#[async_trait]
pub trait AuthenticationService: Send + Sync {
    async fn authenticate(&self, username_or_email: &str, password_hash: &str) -> Result<User, DomainError>;
    async fn validate_session(&self, session_id: &str) -> Result<User, DomainError>;
    async fn invalidate_session(&self, session_id: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait AuthorizationService: Send + Sync {
    async fn check_permission(&self, user: &User, permission: &Permission) -> Result<bool, DomainError>;
    async fn get_user_permissions(&self, user: &User) -> Result<Vec<Permission>, DomainError>;
}

// ===== 内存实现 =====

pub struct InMemoryUserRepository {
    users: std::sync::RwLock<HashMap<UserId, User>>,
}

impl InMemoryUserRepository {
    pub fn new() -> Self {
        Self {
            users: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl UserRepository for InMemoryUserRepository {
    async fn save(&self, user: &User) -> Result<(), DomainError> {
        let mut users = self.users.write().unwrap();
        users.insert(user.id.clone(), user.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &UserId) -> Result<Option<User>, DomainError> {
        let users = self.users.read().unwrap();
        Ok(users.get(id).cloned())
    }

    async fn find_by_username(&self, username: &str) -> Result<Option<User>, DomainError> {
        let users = self.users.read().unwrap();
        let user = users.values().find(|u| u.username == username).cloned();
        Ok(user)
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, DomainError> {
        let users = self.users.read().unwrap();
        let user = users.values().find(|u| u.email == email).cloned();
        Ok(user)
    }

    async fn list_users(&self, status: Option<UserStatus>, role: Option<UserRole>, limit: u32, _offset: u32) -> Result<Vec<User>, DomainError> {
        let users = self.users.read().unwrap();
        let filtered: Vec<User> = users.values()
            .filter(|u| status.as_ref().map_or(true, |s| matches!(&u.status, s)))
            .filter(|u| role.as_ref().map_or(true, |r| matches!(&u.role, r)))
            .take(limit as usize)
            .cloned()
            .collect();
        Ok(filtered)
    }
}

pub struct InMemoryUserSessionRepository {
    sessions: std::sync::RwLock<HashMap<UserSessionId, UserSession>>,
}

impl InMemoryUserSessionRepository {
    pub fn new() -> Self {
        Self {
            sessions: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl UserSessionRepository for InMemoryUserSessionRepository {
    async fn save(&self, session: &UserSession) -> Result<(), DomainError> {
        let mut sessions = self.sessions.write().unwrap();
        sessions.insert(session.id.clone(), session.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &UserSessionId) -> Result<Option<UserSession>, DomainError> {
        let sessions = self.sessions.read().unwrap();
        Ok(sessions.get(id).cloned())
    }

    async fn find_by_user(&self, user_id: &UserId, active_only: bool, limit: u32) -> Result<Vec<UserSession>, DomainError> {
        let sessions = self.sessions.read().unwrap();
        let filtered: Vec<UserSession> = sessions.values()
            .filter(|s| &s.user_id == user_id)
            .filter(|s| !active_only || s.is_active)
            .take(limit as usize)
            .cloned()
            .collect();
        Ok(filtered)
    }

    async fn get_user_statistics(&self, user_id: &UserId) -> Result<UserStatistics, DomainError> {
        let sessions = self.sessions.read().unwrap();
        let user_sessions: Vec<&UserSession> = sessions.values()
            .filter(|s| &s.user_id == user_id)
            .collect();

        let total_sessions = user_sessions.len() as u64;
        let active_sessions = user_sessions.iter().filter(|s| s.is_active).count() as u32;
        let total_session_time: u64 = user_sessions.iter()
            .filter_map(|s| s.ended_at.map(|end| (end - s.started_at).num_seconds() as u64))
            .sum();

        let average_session_time = if total_sessions > 0 {
            total_session_time / total_sessions
        } else {
            0
        };

        Ok(UserStatistics {
            total_sessions,
            active_sessions,
            total_session_time,
            average_session_time,
        })
    }
}

pub struct BasicAuthenticationService;

impl BasicAuthenticationService {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AuthenticationService for BasicAuthenticationService {
    async fn authenticate(&self, username_or_email: &str, password_hash: &str) -> Result<User, DomainError> {
        // 简化实现 - 在实际应用中应该查询数据库
        Err(DomainError::Unauthorized("Authentication not implemented".to_string()))
    }

    async fn validate_session(&self, session_id: &str) -> Result<User, DomainError> {
        // 简化实现
        Err(DomainError::Unauthorized("Session validation not implemented".to_string()))
    }

    async fn invalidate_session(&self, session_id: &str) -> Result<(), DomainError> {
        // 简化实现
        Ok(())
    }
}

pub struct RBACAuthorizationService;

impl RBACAuthorizationService {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AuthorizationService for RBACAuthorizationService {
    async fn check_permission(&self, user: &User, permission: &Permission) -> Result<bool, DomainError> {
        Ok(user.has_permission(permission))
    }

    async fn get_user_permissions(&self, user: &User) -> Result<Vec<Permission>, DomainError> {
        let all_permissions = vec![
            Permission::Read,
            Permission::Write,
            Permission::Delete,
            Permission::Admin,
            Permission::PremiumFeature,
        ];

        let user_permissions: Vec<Permission> = all_permissions.into_iter()
            .filter(|p| user.has_permission(p))
            .collect();

        Ok(user_permissions)
    }
}

// ===== 业务规则 =====

pub struct UserEmailValidRule;

#[async_trait]
impl BusinessRuleValidator<User> for UserEmailValidRule {
    fn rule_name(&self) -> &str {
        "user_email_valid"
    }

    async fn validate(&self, entity: &User, _context: &DomainContext) -> Result<(), DomainError> {
        if !entity.email.contains('@') || !entity.email.contains('.') {
            return Err(DomainError::Validation("Invalid email format".to_string()));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that user email is in valid format"
    }
}

pub struct UsernameNotEmptyRule;

#[async_trait]
impl BusinessRuleValidator<User> for UsernameNotEmptyRule {
    fn rule_name(&self) -> &str {
        "username_not_empty"
    }

    async fn validate(&self, entity: &User, _context: &DomainContext) -> Result<(), DomainError> {
        if entity.username.trim().is_empty() {
            return Err(DomainError::Validation("Username cannot be empty".to_string()));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that username is not empty"
    }
}

pub struct UsernameUniqueRule {
    existing_usernames: std::sync::RwLock<HashMap<String, bool>>,
}

impl UsernameUniqueRule {
    pub fn new() -> Self {
        Self {
            existing_usernames: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl BusinessRuleValidator<User> for UsernameUniqueRule {
    fn rule_name(&self) -> &str {
        "username_unique"
    }

    async fn validate(&self, entity: &User, _context: &DomainContext) -> Result<(), DomainError> {
        let existing = self.existing_usernames.read().unwrap();
        if existing.contains_key(&entity.username) {
            return Err(DomainError::Validation("Username already exists".to_string()));
        }

        // 添加到已知用户名中
        drop(existing);
        let mut existing = self.existing_usernames.write().unwrap();
        existing.insert(entity.username.clone(), true);

        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that username is unique across all users"
    }
}

// ===== 数据传输对象 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserStatistics {
    pub total_sessions: u64,
    pub active_sessions: u32,
    pub total_session_time: u64,
    pub average_session_time: u64,
}