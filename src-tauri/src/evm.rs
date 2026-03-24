use crate::db::{DbResult, SqlitePool};
use chrono::{Datelike, Duration, NaiveDate};
use serde::Serialize;
use sqlx::FromRow;
use std::collections::BTreeMap;

#[derive(Debug, Serialize, FromRow, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct EvmKpis {
    pub bac: f64,
    pub pv: f64,
    pub ev: f64,
    pub ac: f64,
    pub cpi: f64,
    pub spi: f64,
}

#[derive(Debug, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SCurveDataPoint {
    pub date: String,
    pub cumulative_pv: f64,
    pub cumulative_ev: f64,
    pub cumulative_ac: f64,
}

#[derive(FromRow)]
struct ActivityInfo {
    wbs_element_id: i64,
    estimated_pv: Option<f64>,
}

#[derive(FromRow)]
struct ProgressInfo {
    progress_percent: f64,
}

pub async fn calculate_evm_kpis(
    pool: &SqlitePool,
    plan_version_id: i64,
    up_to_date: NaiveDate,
) -> DbResult<EvmKpis> {
    let activities = sqlx::query_as::<_, ActivityInfo>(
        r#"
        SELECT wbs_element_id, estimated_pv 
        FROM wbs_element_details 
        WHERE plan_version_id = ? AND element_type = 'Activity' AND is_deleted = false
        "#,
    )
    .bind(plan_version_id)
    .fetch_all(pool)
    .await?;

    let activity_ids: Vec<i64> = activities.iter().map(|a| a.wbs_element_id).collect();
    let activity_ids_json = serde_json::to_string(&activity_ids)
        .map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

    // 1. BAC (Budget at Completion)
    let bac = activities.iter().filter_map(|a| a.estimated_pv).sum();

    // 2. PV (Planned Value)
    let pv_row: (Option<f64>,) = sqlx::query_as(
        "SELECT SUM(planned_value) FROM pv_allocations WHERE plan_version_id = ? AND end_date <= ?",
    )
    .bind(plan_version_id)
    .bind(up_to_date)
    .fetch_one(pool)
    .await?;
    let pv = pv_row.0.unwrap_or(0.0);

    // 3. AC (Actual Cost)
    let ac_row: (Option<f64>,) = sqlx::query_as(
        "SELECT SUM(actual_cost) FROM actual_costs WHERE wbs_element_id IN (SELECT value FROM json_each(?)) AND work_date <= ?",
    )
    .bind(&activity_ids_json)
    .bind(up_to_date)
    .fetch_one(pool)
    .await?;
    let ac = ac_row.0.unwrap_or(0.0);

    // 4. EV (Earned Value)
    let mut ev = 0.0;
    for activity in &activities {
        let activity_bac = activity.estimated_pv.unwrap_or(0.0);
        if activity_bac > 0.0 {
            let progress_row: Option<ProgressInfo> = sqlx::query_as(
                "SELECT progress_percent FROM progress_updates WHERE wbs_element_id = ? AND report_date <= ? ORDER BY report_date DESC, id DESC LIMIT 1",
            )
            .bind(activity.wbs_element_id)
            .bind(up_to_date)
            .fetch_optional(pool)
            .await?;
            
            if let Some(progress) = progress_row {
                ev += activity_bac * (progress.progress_percent / 100.0);
            }
        }
    }

    // 5. CPI & SPI
    let cpi = if ac > 0.0 { ev / ac } else { 0.0 };
    let spi = if pv > 0.0 { ev / pv } else { 0.0 };

    Ok(EvmKpis { bac, pv, ev, ac, cpi, spi })
}

pub async fn calculate_s_curve_data(
    pool: &SqlitePool,
    plan_version_id: i64,
) -> DbResult<Vec<SCurveDataPoint>> {
    let range: Option<(Option<NaiveDate>, Option<NaiveDate>)> = sqlx::query_as(
        r#"
        SELECT MIN(t.d), MAX(t.d) FROM (
            SELECT start_date as d FROM pv_allocations WHERE plan_version_id = ?
            UNION ALL
            SELECT work_date as d FROM actual_costs ac
            JOIN wbs_element_details wed ON ac.wbs_element_id = wed.wbs_element_id
            WHERE wed.plan_version_id = ?
        ) as t
        "#,
    )
    .bind(plan_version_id)
    .bind(plan_version_id)
    .fetch_optional(pool)
    .await?;

    let (start_date, end_date) = match range {
        Some((Some(min), Some(max))) => (min, max),
        _ => return Ok(vec![]),
    };

    let all_activities = sqlx::query_as::<_, ActivityInfo>(
        "SELECT wbs_element_id, estimated_pv FROM wbs_element_details WHERE plan_version_id = ? AND element_type = 'Activity' AND is_deleted = false",
    )
    .bind(plan_version_id)
    .fetch_all(pool)
    .await?;
    
    let activity_ids: Vec<i64> = all_activities.iter().map(|a| a.wbs_element_id).collect();
    let activity_ids_json = serde_json::to_string(&activity_ids).map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

    let all_allocations: Vec<(NaiveDate, f64)> = sqlx::query_as("SELECT end_date, planned_value FROM pv_allocations WHERE plan_version_id = ?").bind(plan_version_id).fetch_all(pool).await?;
    let all_costs: Vec<(NaiveDate, f64)> = sqlx::query_as("SELECT work_date, actual_cost FROM actual_costs WHERE wbs_element_id IN (SELECT value FROM json_each(?))").bind(&activity_ids_json).fetch_all(pool).await?;
    let all_progress: Vec<(i64, NaiveDate, f64)> = sqlx::query_as("SELECT wbs_element_id, report_date, progress_percent FROM progress_updates WHERE wbs_element_id IN (SELECT value FROM json_each(?)) ORDER BY report_date ASC, id ASC").bind(&activity_ids_json).fetch_all(pool).await?;
    
    let mut progress_map: BTreeMap<(i64, NaiveDate), f64> = BTreeMap::new();
    for (wbs_id, report_date, percent) in all_progress {
        progress_map.insert((wbs_id, report_date), percent);
    }
    
    let mut results = Vec::new();
    let mut current_month_start = start_date.with_day(1).unwrap();

    while current_month_start <= end_date {
        let next_month_start = (current_month_start + Duration::days(32)).with_day(1).unwrap();
        let report_date = next_month_start - Duration::days(1);
        let final_report_date = if report_date > end_date { end_date } else { report_date };

        let cumulative_pv = all_allocations.iter().filter(|(d, _)| *d <= final_report_date).map(|(_, pv)| pv).sum();
        let cumulative_ac = all_costs.iter().filter(|(d, _)| *d <= final_report_date).map(|(_, ac)| ac).sum();

        let mut cumulative_ev = 0.0;
        for activity in &all_activities {
            let activity_bac = activity.estimated_pv.unwrap_or(0.0);
            if activity_bac > 0.0 {
                let latest_progress = progress_map
                    .range(..=((activity.wbs_element_id, final_report_date)))
                    .filter(|((wbs_id, _), _)| *wbs_id == activity.wbs_element_id)
                    .last()
                    .map(|(_, &percent)| percent);

                if let Some(percent) = latest_progress {
                    cumulative_ev += activity_bac * (percent / 100.0);
                }
            }
        }

        results.push(SCurveDataPoint {
            date: current_month_start.format("%Y-%m").to_string(),
            cumulative_pv,
            cumulative_ac,
            cumulative_ev,
        });

        current_month_start = next_month_start;
    }

    Ok(results)
}
