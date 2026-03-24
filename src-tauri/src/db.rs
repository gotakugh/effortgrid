use sqlx::SqlitePool;
use thiserror::Error;

// アプリケーションのローカルファイルとしてデータベースを永続化します。
// 開発中は `src-tauri/` に、リリースビルドでは実行ファイルの隣に `sqlite.db` が作成されます。
const DB_URL: &str = "sqlite:sqlite.db?mode=rwc";

#[derive(Debug, Error)]
pub enum DbError {
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Migration(#[from] sqlx::migrate::MigrateError),
}

// データベース操作用のカスタムResult型
pub type DbResult<T> = Result<T, DbError>;

/// データベース接続を初期化します。
/// データベースファイルが存在しない場合は作成し、マイグレーションを実行します。
pub async fn init_db() -> DbResult<SqlitePool> {
    // DB_URLの `?mode=rwc` (read-write-create) がファイルの自動作成を処理します。
    let pool = SqlitePool::connect(DB_URL).await?;

    // 起動時にマイグレーションを自動実行します。
    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}
