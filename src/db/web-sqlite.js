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

export const loadSqlJsLibrary = () => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') return reject(new Error("Window not defined"));
        if (window.initSqlJs) return resolve(window.initSqlJs);

        console.log("WebSQLite: Injecting /sql-wasm.js script...");
        const script = document.createElement('script');
        script.src = '/sql-wasm.js';
        script.async = true;
        script.onload = () => {
            console.log("WebSQLite: /sql-wasm.js loaded!");
            if (window.initSqlJs) {
                resolve(window.initSqlJs);
            } else {
                reject(new Error("window.initSqlJs is undefined after script load"));
            }
        };
        script.onerror = (e) => {
            console.error("WebSQLite: Failed to load script", e);
            reject(new Error("Failed to load /sql-wasm.js"));
        };
        document.body.appendChild(script);
    });
};

export const openDatabaseAsync = async (name) => {
    // If db already loaded, return wrapper
    if (db) return createWrapper(db);

    try {
        // First ensure WASM file exists
        console.log("WebSQLite: Checking /sql-wasm.wasm...");
        const check = await fetch('/sql-wasm.wasm');
        if (!check.ok) {
            throw new Error(`WASM file missing at root (/sql-wasm.wasm). Status: ${check.status}`);
        }

        // Load the library script dynamically
        const initSqlJs = await loadSqlJsLibrary();

        // Initialize SQL.js with correct locator
        const SQL = await Promise.race([
            initSqlJs({
                locateFile: () => '/sql-wasm.wasm'
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("SQL.js WASM initialization timed out")), 15000))
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
        // Normalize params to array
        const normalizedParams = Array.isArray(params) ? params : [params];
        console.log("WebDB Run:", sql.substring(0, 50), normalizedParams);
        try {
            db.run(sql, normalizedParams);
            const changes = db.getRowsModified();
            console.log("WebDB Run: rows modified:", changes);
            // Save immediately for writes
            await saveDB();
            return { changes };
        } catch (err) {
            console.error("SQL Error:", err);
            throw err;
        }
    },
    getAllAsync: async (sql, params = []) => {
        // Normalize params to array
        const normalizedParams = Array.isArray(params) ? params : [params];
        const stmt = db.prepare(sql);
        stmt.bind(normalizedParams);
        const result = [];
        while (stmt.step()) {
            result.push(stmt.getAsObject());
        }
        stmt.free();
        return result;
    },
    getFirstAsync: async (sql, params = []) => {
        // Normalize params to array
        const normalizedParams = Array.isArray(params) ? params : [params];
        const stmt = db.prepare(sql);
        stmt.bind(normalizedParams);
        let result = null;
        if (stmt.step()) {
            result = stmt.getAsObject();
        }
        stmt.free();
        return result;
    }
});
