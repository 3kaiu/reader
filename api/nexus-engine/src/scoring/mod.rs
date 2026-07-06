#![allow(dead_code)]

//! Scoring module — content quality assessment and feature extraction.
//!
//! Provides a `ContentScorer` trait that decouples scoring logic
//! from the content extraction pipeline, enabling testability and
//! future model replacement.

mod ml_scorer;
mod visual_features;