import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import JSZip from 'jszip';
import { getDB } from '../db';

const getAnkiDbPath = () => FileSystem.documentDirectory + 'SQLite/temp_import.db';

export const importAnkiPackage = async (fileUri) => {
    console.log("Starting import for:", fileUri);
    try {
        const fileContent = await FileSystem.readAsStringAsync(fileUri, {
            encoding: 'base64'
        });

        const zip = await JSZip.loadAsync(fileContent, { base64: true });

        console.log("Zip keys:", Object.keys(zip.files));

        const { decompress } = require('fzstd'); // Use require for fzstd if import fails, or stick to import if using ESM. fzstd exports compress/decompress.

        // Extract database
        let dbData;
        const v2File = zip.file('collection.anki21b');
        const v1File = zip.file('collection.anki2') || zip.files['collection.anki2'];

        if (v2File) {
            console.log("Found V2 (Zstd) database. Decompressing...");
            const compressedData = await v2File.async('uint8array');
            console.log("Compressed size:", compressedData.length);
            const decompressed = decompress(compressedData);
            console.log("Decompressed size:", decompressed.length);
            // Convert to base64 for FileSystem using chunked approach
            const CHUNK_SIZE = 8192;
            let binary = '';
            for (let i = 0; i < decompressed.length; i += CHUNK_SIZE) {
                const chunk = decompressed.subarray(i, Math.min(i + CHUNK_SIZE, decompressed.length));
                binary += String.fromCharCode.apply(null, chunk);
            }
            dbData = btoa(binary);
            console.log("Base64 encoded, length:", dbData.length);
        } else if (v1File) {
            console.log("Found V1 (Legacy) database.");
            dbData = await v1File.async('base64');
        } else {
            throw new Error('Invalid .apkg: missing database. Found: ' + Object.keys(zip.files).join(', '));
        }

        const tempDbPath = getAnkiDbPath();

        const sqliteDir = FileSystem.documentDirectory + 'SQLite';
        const dirInfo = await FileSystem.getInfoAsync(sqliteDir);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(sqliteDir);
        }

        await FileSystem.writeAsStringAsync(tempDbPath, dbData, {
            encoding: 'base64'
        });

        // Extract Media
        let mediaMap = {};
        if (zip.files['media']) {
            try {
                const mediaJson = await zip.files['media'].async('string');
                // Check if it looks like JSON
                if (mediaJson && mediaJson.trim().startsWith('{')) {
                    mediaMap = JSON.parse(mediaJson);
                } else {
                    console.warn("Media file found but it is not valid JSON.");
                }
            } catch (e) {
                console.warn("Failed to parse media map JSON", e);
            }
        }

        const mediaDir = FileSystem.documentDirectory + 'media/';
        const mediaDirInfo = await FileSystem.getInfoAsync(mediaDir);
        if (!mediaDirInfo.exists) {
            await FileSystem.makeDirectoryAsync(mediaDir);
        }

        // We only extract media if it exists. Large loops might block JS thread.
        // In a real app, this should be chunked or yielded.
        for (const [key, filename] of Object.entries(mediaMap)) {
            if (zip.files[key]) {
                const mediaData = await zip.files[key].async('base64');
                await FileSystem.writeAsStringAsync(mediaDir + filename, mediaData, {
                    encoding: 'base64'
                });
            }
        }

        // Copy to database
        const tempDb = await SQLite.openDatabaseAsync('temp_import.db');
        const mainDb = await getDB();

        // Check which schema we're dealing with
        // New Anki format has a 'decks' table, old format has decks JSON in 'col' table
        let decksJson = {};

        try {
            // List all tables for debugging
            const allTables = await tempDb.getAllAsync("SELECT name FROM sqlite_master WHERE type='table'");
            console.log("All tables in DB:", allTables.map(t => t.name).join(', '));

            // Try new format first - check if decks table exists
            const tablesResult = await tempDb.getAllAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='decks'");

            if (tablesResult.length > 0) {
                // New Anki format - read from decks table
                console.log("Detected NEW Anki format (separate decks table)");
                const decksResult = await tempDb.getAllAsync('SELECT id, name FROM decks');
                console.log("Decks from table:", decksResult.length);
                for (const deck of decksResult) {
                    decksJson[deck.id.toString()] = { name: deck.name || 'Imported Deck' };
                }
            } else {
                // Old Anki format - read from col table
                console.log("Detected OLD Anki format (col.decks JSON)");
                const colResult = await tempDb.getAllAsync('SELECT decks, models FROM col');
                console.log("Col result:", colResult.length, "rows");

                if (colResult && colResult.length > 0 && colResult[0].decks && colResult[0].decks.trim().length > 0) {
                    console.log("Decks raw (first 200 chars):", colResult[0].decks?.substring(0, 200));
                    decksJson = JSON.parse(colResult[0].decks);
                } else {
                    // Fallback - create a default deck
                    console.log("No decks found in col table, creating default");
                    decksJson = { '1': { name: 'Imported Deck' } };
                }
            }

            // If still empty, create default
            if (Object.keys(decksJson).length === 0) {
                console.log("decksJson is empty, creating fallback deck");
                decksJson = { '1': { name: 'Imported Deck' } };
            }
        } catch (schemaErr) {
            console.error("Schema detection error:", schemaErr);
            // Ultimate fallback
            decksJson = { '1': { name: 'Imported Deck' } };
        }

        console.log("Decks JSON Keys:", Object.keys(decksJson));

        const deckMap = {};

        for (const [deckId, deck] of Object.entries(decksJson)) {
            // Skip "Default" deck if there are other decks
            if (deck.name === 'Default' && Object.keys(decksJson).length > 1) {
                console.log("Skipping Default deck:", deckId);
                continue;
            }

            console.log("Processing deck:", deck.name, "ID:", deckId);

            // Check if deck exists or just insert
            const result = await mainDb.runAsync(
                'INSERT INTO decks (original_id, name) VALUES (?, ?)',
                parseInt(deckId), deck.name
            );
            deckMap[deckId] = result.lastInsertRowId;
        }

        const notes = await tempDb.getAllAsync('SELECT id, flds, mid FROM notes');
        const cards = await tempDb.getAllAsync('SELECT id, nid, did FROM cards');

        // Analyze Card Deck IDs
        const distinctDids = [...new Set(cards.map(c => c.did))];
        console.log("Distinct Deck IDs in Cards:", distinctDids);

        const noteMap = new Map();
        notes.forEach(n => noteMap.set(n.id, n));

        // Ensure we have a default target if specific deck is missing
        // deckMap['1'] should exist if we allowed Default. 
        // If not, we take the first available deck from the map.
        const fallbackDeckId = deckMap['1'] || Object.values(deckMap)[0];

        await mainDb.withTransactionAsync(async () => {
            let insertedCount = 0;
            console.log("Total notes found:", notes.length);
            console.log("Total cards found:", cards.length);

            for (const card of cards) {
                let targetDeckId = deckMap[card.did];

                if (!targetDeckId) {
                    // console.log("Card has unknown deck:", card.did, "Falling back to Default.");
                    targetDeckId = fallbackDeckId;
                }

                if (!targetDeckId) {
                    console.log("CRITICAL: No deck to insert card into. Skipping.");
                    continue;
                }

                const note = noteMap.get(card.nid);
                if (!note) {
                    console.log("No note found for card:", card.id);
                    continue;
                }

                const fields = note.flds.split('\x1f');
                const question = fields[0] || 'Empty';
                const answer = fields.slice(1).join('\n\n');

                await mainDb.runAsync(
                    'INSERT INTO cards (deck_id, original_id, question, answer, due, state) VALUES (?, ?, ?, ?, ?, ?)',
                    targetDeckId, card.id, question, answer, new Date().toISOString(), 0
                );
                insertedCount++;
            }
            console.log("Total cards inserted:", insertedCount);
        });

        await tempDb.closeAsync();
        await FileSystem.deleteAsync(tempDbPath);

        console.log("Import success");
        return true;

    } catch (e) {
        console.error("Import failed", e);
        throw e;
    }
};
