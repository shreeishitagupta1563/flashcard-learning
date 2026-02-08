import initSqlJs from 'sql.js';
import localforage from 'localforage';

let db = null;
let saveTimer = null;

const WASM_URL = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm';

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
        const SQL = await initSqlJs({
            // locateFile normally looks relative to script, but we use CDN for ease
            locateFile: file => WASM_URL
        });

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
