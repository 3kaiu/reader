#[derive(Debug, Clone)]
pub(super) struct ProbeInsights {
    pub(super) chapter_like_links: usize,
    pub(super) best_toc_selector: String,
    pub(super) best_toc_score: f64,
    pub(super) best_content_selector: String,
    pub(super) best_content_score: f64,
}

#[derive(Debug, Clone)]
pub(super) struct SearchProbeInsights {
    pub(super) list_selector: String,
    pub(super) list_score: f64,
    pub(super) result_count: usize,
    pub(super) name_selector: String,
    pub(super) url_selector: String,
    pub(super) author_selector: Option<String>,
    pub(super) intro_selector: Option<String>,
    pub(super) result_filter: Option<String>,
    pub(super) next_page_selector: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct SearchEntryProbeInsights {
    pub(super) action_url: String,
    pub(super) method: String,
    pub(super) keyword_param: String,
    pub(super) body_template: Option<String>,
    pub(super) form_selector: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct SearchSample {
    pub(super) request_url: String,
    pub(super) final_url: String,
    pub(super) method: String,
    pub(super) body_template: Option<String>,
    pub(super) status: u16,
    pub(super) html: String,
}

#[derive(Debug, Clone)]
pub(super) struct SameSiteValidationInsights {
    pub(super) score: f64,
    pub(super) candidate_count: usize,
    pub(super) validated_url: Option<String>,
    pub(super) warnings: Vec<String>,
}
