import * as SQLite from 'expo-sqlite';

let dbInstance = null;

export const getDB = async () => {
    if (!dbInstance) {
        dbInstance = await SQLite.openDatabaseAsync('dutchflow.db');
    }
    return dbInstance;
};

export const initDB = async () => {
    const db = await getDB();
    await db.execAsync(`
    PRAGMA journal_mode = WAL;
    
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_id INTEGER,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER,
      original_id INTEGER, -- Anki Card ID
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      media_files TEXT, -- JSON array of filenames or map

      -- FSRS / Scheduling fields
      state INTEGER DEFAULT 0, -- 0=New, 1=Learning, 2=Review, 3=Relearning
      due TEXT, -- ISO string
      stability REAL DEFAULT 0,
      difficulty REAL DEFAULT 0,
      elapsed_days REAL DEFAULT 0,
      scheduled_days REAL DEFAULT 0,
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      last_review TEXT,

      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );
  `);
};
