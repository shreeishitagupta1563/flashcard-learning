import initSqlJs from 'sql.js';
import localforage from 'localforage';

let db = null;
let saveTimer = null;

const saveDB = async () => {
    if (db) {
        const data = db.export();
        await localforage.setItem('pels_db', data);
    }
};

const triggerSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDB, 1000); // Debounce save
};

export const openDatabaseAsync = async (name) => {
    // If db already loaded, return wrapper
    if (db) return createWrapper(db);

    try {
        console.log("WebSQLite: checking /sql-wasm.wasm...");
        const check = await fetch('/sql-wasm.wasm');
        if (!check.ok) {
            console.error(`WebSQLite: /sql-wasm.wasm failed with status ${check.status}`);
            throw new Error(`WASM file missing at root (/sql-wasm.wasm). Status: ${check.status}`);
        }
        console.log("WebSQLite: /sql-wasm.wasm found! Content-Type:", check.headers.get('content-type'));

        const SQL = await Promise.race([
            initSqlJs({
                locateFile: () => '/sql-wasm.wasm'
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("SQL.js WASM load timed out (even with file present!)")), 10000))
        ]);

        const savedData = await localforage.getItem('pels_db');
        if (savedData) {
            db = new SQL.Database(new Uint8Array(savedData));
        } else {
            db = new SQL.Database();
        }

        return createWrapper(db);
    } catch (e) {
        console.error("Failed to init WebSQL:", e);
        throw e;
    }
};

const createWrapper = (db) => ({
    execAsync: async (sql) => {
        console.log("WebDB Exec:", sql.substring(0, 50));
        db.exec(sql);
        triggerSave();
    },
    runAsync: async (sql, params = []) => {
        // sql.js 'run' executes but doesn't return result, 'exec' returns result
        // We use prepare/run for parameterized query
        console.log("WebDB Run:", sql.substring(0, 50), params);

        // Handle params format: sql.js expects array
        try {
            db.run(sql, params);
            triggerSave();
            return { changes: db.getRowsModified() };
        } catch (err) {
            console.error("SQL Error:", err);
            throw err;
        }
    },
    getAllAsync: async (sql, params = []) => {
        // Use prepare/step for results
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const result = [];
        while (stmt.step()) {
            result.push(stmt.getAsObject());
        }
        stmt.free();
        return result;
    },
    getFirstAsync: async (sql, params = []) => {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        let result = null;
        if (stmt.step()) {
            result = stmt.getAsObject();
        }
        stmt.free();
        return result;
    }
});
