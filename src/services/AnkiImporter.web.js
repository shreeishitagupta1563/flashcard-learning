import JSZip from 'jszip';
import { getDB } from '../db';
import { loadSqlJsLibrary } from '../db/web-sqlite.js'; // Use shared loader
import { decompress } from 'fzstd';

export const importAnkiPackage = async (fileUri) => {
    console.log("Web Import: Fetching URI", fileUri);
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    console.log("Web Import: Loading Zip");
    const zip = await JSZip.loadAsync(arrayBuffer);

    let dbBuffer;
    const v2File = zip.file('collection.anki21b');
    const v1File = zip.file('collection.anki2');

    if (v2File) {
        console.log("Found V2 database (compressed)");
        const compressed = await v2File.async('uint8array');
        dbBuffer = decompress(compressed);
    } else if (v1File) {
        console.log("Found V1 database");
        dbBuffer = await v1File.async('uint8array');
    } else {
        throw new Error("Invalid .apkg: missing database");
    }

    console.log("Web Import: Opening Anki DB in memory");

    // Load SQL.js via dynamic script
    const initSqlJs = await loadSqlJsLibrary(); // Reuses window.initSqlJs
    const SQL = await initSqlJs({
        locateFile: () => '/sql-wasm.wasm'
    });
    const ankiDb = new SQL.Database(dbBuffer);

    // Check tables
    const tablesRes = ankiDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='col'");
    if (!tablesRes.length || !tablesRes[0].values.length) {
        throw new Error("Invalid Anki DB schema");
    }

    // Get Decks
    const colRes = ankiDb.exec("SELECT decks, models FROM col");
    const colRow = colRes[0].values[0];
    const decksJson = JSON.parse(colRow[0]);

    console.log("Web Import: Decks JSON Keys:", Object.keys(decksJson));
    console.log("Web Import: Full Decks Structure:", JSON.stringify(decksJson).substring(0, 200) + "...");

    const mainDb = await getDB();

    for (const [deckId, deck] of Object.entries(decksJson)) {
        console.log(`Web Import: Inspecting Deck ID ${deckId}, Name: "${deck.name}"`);

        if (deck.name === 'Default' && Object.keys(decksJson).length > 1) {
            console.log("Web Import: Skipping Default deck");
            continue;
        }

        console.log("Processing Deck:", deck.name);

        let existingDeck = await mainDb.getFirstAsync("SELECT id FROM decks WHERE original_id = ?", [deckId]);
        let localDeckId;

        if (existingDeck) {
            localDeckId = existingDeck.id;
        } else {
            await mainDb.runAsync("INSERT INTO decks (original_id, name) VALUES (?, ?)", [deckId, deck.name]);
            // Get last ID - sql.js doesn't return ID directly in runAsync wrapper, need specific query
            // Actually our runAsync wrapper returns { changes }, not lastId.
            // We can query max ID.
            const res = await mainDb.getFirstAsync("SELECT last_insert_rowid() as id");
            localDeckId = res.id;
        }

        // Get Cards (notes)
        // Schema V1/V2 detection roughly same logic
        let query;
        // Check if 'cards' table has 'did' or we need to join 'notes'
        // Simplified approach: try selecting from cards
        // Note: Anki V2 schema is complex. V1 is clearer.
        // Let's assume standard join query works.

        // Try to detect schema fields
        const cardFieldsRes = ankiDb.exec("PRAGMA table_info(cards)");
        const cardFields = cardFieldsRes[0].values.map(v => v[1]);

        if (cardFields.includes('nid')) {
            // Standard schema: cards join notes
            query = `
                SELECT c.id, c.nid, c.did, n.flds, n.sfld 
                FROM cards c 
                JOIN notes n ON c.nid = n.id 
                WHERE c.did = ${deckId}
             `;
        } else {
            // Maybe everything in cards? Unlikely for Anki.
            query = `SELECT * FROM cards WHERE did = ${deckId}`;
        }

        const cardsRes = ankiDb.exec(query);
        if (cardsRes.length > 0) {
            const rows = cardsRes[0].values;
            const columns = cardsRes[0].columns;

            const fldsIdx = columns.indexOf('flds');
            const idIdx = columns.indexOf('id');
            // const nidIdx = columns.indexOf('nid');

            for (const row of rows) {
                const flds = row[fldsIdx];
                const parts = flds.split('\x1f');
                const question = parts[0];
                const answer = parts.length > 1 ? parts[1] : '';
                const originalId = row[idIdx];

                await mainDb.runAsync(`
                    INSERT INTO cards (deck_id, original_id, question, answer, due, state)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [localDeckId, originalId, question, answer, new Date().toISOString(), 0]); // New state
            }
        }
    }

    ankiDb.close();
    console.log("Web Import: Complete");

    return true;
};
