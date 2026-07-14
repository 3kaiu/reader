# ADR 002: Clean Architecture with DDD in Rust Backend

## Status
Accepted

## Context
The Rust backend (`api/`) consists of multiple crates:
- `nexus-core`: Domain models, traits, types (pure domain, no I/O)
- `nexus-engine`: Content extraction, translation, anti-crawl strategies
- `nexus-storage`: Persistence layer (sled, moka, file-based)
- `nexus-server`: HTTP server (axum), routing, orchestration

## Decision
We will apply Clean Architecture with Domain-Driven Design (DDD) principles:

1. **Domain Layer** (`nexus-core/domain/`): 
   - Aggregates: `BookSource`, `Book`, `ReadingSession`
   - Value Objects: `SourceId`, `SourceName`, `SourceUrl`, `SourceReadinessState`
   - Domain Events: `SourceCreated`, `SourceStatusChanged`, `ValidationCompleted`
   - Repositories (Ports): `BookSourceRepository`, `BookSourceReadModel`

2. **Application Layer** (new `nexus-application` crate):
   - Use Cases: `ImportSource`, `SearchBooks`, `StartReading`, `ReplaceContent`
   - DTOs for API boundaries

3. **Infrastructure Layer** (adapters):
   - `nexus-engine` implements `ContentExtractorPort`, `FetcherPort`, `AntiCrawlPort`
   - `nexus-storage` implements `BookSourceRepository`, `BookSourceReadModel`
   - `nexus-server` implements HTTP handlers calling use cases

4. **Ports** (`nexus-core/ports/`):
   - Traits define contracts between layers
   - Multiple implementations possible (e.g., `ReadabilityAdapter` vs `LegadoAdapter` for `ContentExtractorPort`)

## Consequences
**Positive:**
- Clear separation of concerns
- Domain logic testable without infrastructure
- Easy to swap implementations (e.g., different extractors)
- Use cases are explicit and reusable

**Negative:**
- More boilerplate (ports, adapters, use cases)
- More indirection to trace execution flow
- New crate (`nexus-application`) needed

## Implementation Status
- Domain models: ✅ (`BookSource` aggregate with state machine)
- Domain events: ✅ (`SourceCreated`, `SourceStatusChanged`, etc.)
- Repository ports: ✅ (`BookSourceRepository`, `BookSourceReadModel`)
- Ports: ✅ (`FetcherPort`, `ContentExtractorPort`, `AntiCrawlPort`, `StoragePort`, `CachePort`)
- Adapters: 🟡 In progress (`ReadabilityAdapter`, `LegadoAdapter`)
- Use cases: ❌ Not yet (`nexus-application` crate needed)