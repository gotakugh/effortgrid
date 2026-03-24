use crate::db::{self, PlanVersion, Project, SqlitePool, WbsElementDetail};
use serde::{Deserialize, Serialize};
use tauri::State;

// ----- Custom Error Type -----

#[derive(Debug, thiserror::Error, Serialize)]
pub enum AppError {
    #[error("Database error: {0}")]
    DbError(String),
}

impl From<db::DbError> for AppError {
    fn from(e: db::DbError) -> Self {
        AppError::DbError(e.to_string())
    }
}

type AppResult<T> = Result<T, AppError>;

// ----- Command Payloads & Results -----

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectResult {
    project: Project,
    initial_plan_version: PlanVersion,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddWbsElementPayload {
    plan_version_id: i64,
    parent_element_id: Option<i64>,
    milestone_id: Option<i64>,
    title: String,
    description: Option<String>,
    element_type: db::WbsElementType,
    estimated_pv: Option<f64>,
    tags: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWbsElementPvPayload {
    id: i64,
    estimated_pv: Option<f64>,
}

// ----- Tauri Commands -----

#[tauri::command]
pub async fn create_project(
    pool: State<'_, SqlitePool>,
    name: String,
) -> AppResult<CreateProjectResult> {
    let (project, plan_version) = db::create_project(&pool, &name).await?;
    Ok(CreateProjectResult {
        project,
        initial_plan_version: plan_version,
    })
}

#[tauri::command]
pub async fn add_wbs_element(
    pool: State<'_, SqlitePool>,
    payload: AddWbsElementPayload,
) -> AppResult<WbsElementDetail> {
    let new_element = db::add_wbs_element(
        &pool,
        payload.plan_version_id,
        payload.parent_element_id,
        payload.milestone_id,
        &payload.title,
        payload.description.as_deref(),
        payload.element_type,
        payload.estimated_pv,
        payload.tags.as_deref(),
    )
    .await?;
    Ok(new_element)
}

#[tauri::command]
pub async fn list_wbs_elements(
    pool: State<'_, SqlitePool>,
    plan_version_id: i64,
) -> AppResult<Vec<WbsElementDetail>> {
    let elements = db::list_wbs_elements(&pool, plan_version_id).await?;
    Ok(elements)
}

#[tauri::command]
pub async fn list_projects(pool: State<'_, SqlitePool>) -> AppResult<Vec<Project>> {
    let projects = db::list_projects(&pool).await?;
    Ok(projects)
}

#[tauri::command]
pub async fn list_plan_versions_for_project(
    pool: State<'_, SqlitePool>,
    project_id: i64,
) -> AppResult<Vec<PlanVersion>> {
    let versions = db::list_plan_versions_for_project(&pool, project_id).await?;
    Ok(versions)
}

#[tauri::command]
pub async fn update_wbs_element_pv(
    pool: State<'_, SqlitePool>,
    payload: UpdateWbsElementPvPayload,
) -> AppResult<()> {
    // ARCHITECTURE.md: "末端入力の原則" を適用
    let element_type: String =
        sqlx::query_scalar("SELECT element_type FROM wbs_element_details WHERE id = ?")
            .bind(payload.id)
            .fetch_one(&*pool)
            .await
            .map_err(db::DbError::from)?;

    if element_type != "Activity" {
        return Err(AppError::DbError(
            "PV can only be estimated for 'Activity' elements.".to_string(),
        ));
    }

    db::update_wbs_element_pv(&pool, payload.id, payload.estimated_pv).await?;
    Ok(())
}
