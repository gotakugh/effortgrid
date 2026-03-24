# Database Schema & Architecture

## Overview
本プロジェクトは、WBS (Work Breakdown Structure) と EVM (Earned Value Management) を管理するためのデータベース構造を持つ。
最大の特徴は、計画の履歴（ベースライン）をGitのようにスナップショットとして保存し、現実の実績（AC/EV）と完全に分離して管理する「Copy-on-Write (CoW) モデル」を採用している点である。

## Entity Relationship Diagram (ER図)

```mermaid
erDiagram
    %% Master Entities
    projects ||--o{ tasks : "has many"
    projects ||--o{ snapshots : "has baselines"
    users ||--o{ actual_entries : "works on"
    
    %% WBS & Revisions (Git-like history)
    tasks ||--o{ task_revisions : "has history (HEAD pointer)"
    tasks ||--o{ actual_entries : "has reality (Actuals)"
    tasks ||--o{ pv_allocations : "has plans (PV)"

    %% Snapshots (Point-in-time Baselines)
    snapshots ||--o{ snapshot_task_refs : "records task states"
    task_revisions ||--o{ snapshot_task_refs : "referenced by"
    snapshots ||--o{ pv_allocations : "planned values at this time"

    projects {
        INTEGER id PK
        TEXT name
    }
    users {
        INTEGER id PK
        TEXT name
        TEXT role
    }
    tasks {
        INTEGER id PK "Global ID"
        INTEGER project_id FK
        INTEGER head_revision_id FK "Pointer to latest revision"
    }
    task_revisions {
        INTEGER id PK
        INTEGER task_id FK
        INTEGER parent_task_id FK "For WBS tree structure"
        TEXT title
        INTEGER revision_number
        BOOLEAN is_locked "If true, triggers Copy-on-Write"
    }
    snapshots {
        INTEGER id PK
        INTEGER project_id FK
        TEXT name "e.g., V1 Baseline"
        BOOLEAN is_latest "Is current working plan"
    }
    snapshot_task_refs {
        INTEGER snapshot_id FK
        INTEGER task_revision_id FK
    }
    pv_allocations {
        INTEGER id PK
        INTEGER snapshot_id FK
        INTEGER task_id FK
        INTEGER user_id FK
        DATE work_date
        REAL planned_value "PV (Hours or Cost)"
    }
    actual_entries {
        INTEGER id PK
        INTEGER task_id FK "Tied to Global ID, NOT revision"
        INTEGER user_id FK
        DATE work_date
        REAL actual_cost "AC"
        REAL progress_percent "For EV calculation"
    }
	
