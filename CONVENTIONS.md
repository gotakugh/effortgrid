# Coding Conventions (Best Practices)

## Frontend (React / TypeScript) Best Practices
1. **Custom Hooks for IPC:** コンポーネント内で直接 `@tauri-apps/api/core` の `invoke` を呼び出さないこと。必ず `useTasks.ts` のようなカスタムフックを作成し、データ取得や保存のロジックをUIから分離（カプセル化）すること。
2. **Form Validation:** フォームの入力やバリデーションには `@mantine/form` と `zod`（スキーマ定義）を組み合わせて使用し、型安全な入力チェックを徹底すること。
3. **State Management:** サーバー状態（Rustから取得したデータ）と、UIのローカル状態（モーダルの開閉など）を明確に区別すること。
4. **Immutability & Types:** `any` の使用は厳禁。Rustから返却されるJSONには必ず完全な `interface` または `type` を定義すること。

## Backend (Rust / sqlx) Best Practices
- **Custom Error Type:** Tauriコマンドの戻り値 `Result<T, E>` のエラー型 `E` には `String` を使わず、必ず `serde::Serialize` を実装した独自の `AppError` 列挙型を定義すること（`thiserror` クレートの利用を推奨）。
- **Repository Pattern:** `main.rs` や `lib.rs` のTauriコマンドハンドラ内に直接複雑なSQLやビジネスロジックを書かないこと。DBアクセス用の関数は別のモジュール（例: `db::tasks`）に切り出すこと。
- **sqlx Macros:** 常に `sqlx::query!` または `sqlx::query_as!` を使用し、コンパイル時のSQL構文チェックと型チェックを有効にすること。
- **Offline Mode:** 将来的なCI/CDを考慮し、`sqlx-data.json` を用いたオフラインビルドが可能な状態を保つこと。
- **パラダイム:** C++やC#で一般的な深いクラス継承ツリーを用いたオブジェクト指向設計は避け、Rustの機能である**トレイト（Trait）と列挙型（Enum）を活用したコンポジション**を優先して設計すること。

## Communication Rules
- Rust側の引数・フィールドはスネークケース（`project_id`）、TypeScript側はキャメルケース（`projectId`）を厳守する。Tauriの自動変換機能を活用し、手動でのマッピングコードは書かないこと。

## AIアシスタントへの基本指示 (AI Behavior)
- **言語設定:** 私（ユーザー）への返答、コードの解説、すべて**日本語**で行うこと。コード本文には日本語を使用せず英語を使用すること。
- **教育的アプローチ:** Rustの所有権（Ownership）や借用（Borrowing）、ライフタイムに関するエラーが発生した場合は、修正コードだけでなく、なぜエラーになったのかの理由を簡潔に解説すること。
- **ドキュメント参照:** 設計の詳細やタスクの状況は適宜 `architecture.md` や `.org` ファイル（Org-mode）を参照して文脈を把握すること。

## Gitコミット規約
- コミットメッセージは以下のプレフィックスを付けて英語で記述すること。
  - `feat:` 新機能の追加
  - `fix:` バグ修正
  - `refactor:` リファクタリング（機能変更なし）
  - `docs:` ドキュメントの更新
  - `chore:` ビルドプロセスやツールの変更
