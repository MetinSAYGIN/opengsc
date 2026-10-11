// Minimal typing for sql.js (used only by scripts/import-rag.ts — pure-WASM SQLite).
// Only the surface the script touches: Database construction, run/prepare/exec, export, close.
declare module "sql.js" {
  interface SqlJsStatement {
    run(params?: unknown[]): void;
  }
  interface SqlJsExecResult {
    columns: string[];
    values: unknown[][];
  }
  interface SqlJsDatabase {
    run(sql: string, params?: unknown[]): void;
    prepare(sql: string): SqlJsStatement;
    exec(sql: string): SqlJsExecResult[];
    /** Rows changed by the most recent statement run against this database. */
    getRowsModified(): number;
    export(): Uint8Array;
    close(): void;
  }
  interface SqlJsStatic {
    Database: new (data?: Uint8Array | null) => SqlJsDatabase;
  }
  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
