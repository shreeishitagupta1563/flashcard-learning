import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { getDB } from '../db';

export default function DeckList({ onSelectDeck, onImport, onLoadDemo, onOpenStats, onOpenSettings }) {
    const [decks, setDecks] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadDecks = useCallback(async () => {
        const db = await getDB();
        try {
            console.log("Fetching decks...");
            const result = await db.getAllAsync(`
                SELECT d.*, COUNT(c.id) as total_cards,
                       SUM(CASE WHEN c.due <= datetime('now') OR c.state = 0 THEN 1 ELSE 0 END) as due_cards
                FROM decks d
                LEFT JOIN cards c ON c.deck_id = d.id
                GROUP BY d.id
            `);
            console.log("Decks fetched:", result);
            setDecks(result);
        } catch (e) {
            console.error("Error fetching decks:", e);
        }
    }, []);

    useEffect(() => {
        loadDecks();
    }, [loadDecks]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadDecks();
        setRefreshing(false);
    };

    const handleDeleteDeck = async (deck) => {
        Alert.alert(
            "Delete Deck",
            `Are you sure you want to delete "${deck.name}" and all its cards? This cannot be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const db = await getDB();
                            // Delete cards first, then deck
                            await db.runAsync('DELETE FROM cards WHERE deck_id = ?', deck.id);
                            await db.runAsync('DELETE FROM decks WHERE id = ?', deck.id);
                            await loadDecks();
                            Alert.alert("Deleted", `"${deck.name}" has been deleted.`);
                        } catch (e) {
                            console.error("Error deleting deck:", e);
                            Alert.alert("Error", "Failed to delete deck.");
                        }
                    }
                }
            ]
        );
    };

    const handleLongPress = (deck) => {
        Alert.alert(
            deck.name,
            "What would you like to do?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Study", onPress: () => onSelectDeck(deck) },
                { text: "Delete", style: "destructive", onPress: () => handleDeleteDeck(deck) }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>PELS</Text>
                    <Text style={styles.subtitle}>Pieter Experimental Language School</Text>
                </View>
                <View style={styles.headerButtons}>
                    <TouchableOpacity onPress={onOpenStats} style={styles.iconBtn}>
                        <Text style={styles.iconText}>📊</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onOpenSettings} style={styles.iconBtn}>
                        <Text style={styles.iconText}>⚙️</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                <TouchableOpacity onPress={onImport} style={[styles.importBtn, { flex: 1, alignItems: 'center' }]}>
                    <Text style={styles.importText}>+ Import File</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={decks}
                keyExtractor={item => item.id.toString()}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyEmoji}>📚</Text>
                        <Text style={styles.empty}>No decks found</Text>
                        <Text style={styles.emptyHint}>Import a .apkg file to get started!</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.card}
                        onPress={() => onSelectDeck(item)}
                        onLongPress={() => handleLongPress(item)}
                        delayLongPress={500}
                        // Web: Right-click triggers context menu (same as long press)
                        onContextMenu={(e) => {
                            e.preventDefault();
                            handleLongPress(item);
                        }}
                    >
                        <View style={styles.cardContent}>
                            <Text style={styles.deckName}>{item.name}</Text>
                            <Text style={styles.deckSub}>{item.total_cards} Cards</Text>
                        </View>
                        <View style={styles.cardRight}>
                            <TouchableOpacity
                                style={styles.deleteBtn}
                                onPress={() => handleDeleteDeck(item)}
                            >
                                <Text style={styles.deleteBtnText}>🗑️</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                )}
                contentContainerStyle={styles.list}
            />

            <Text style={styles.hint}>💡 Long press (or right-click) a deck for options</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingTop: 60, paddingHorizontal: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontFamily: 'Inter_900Black', fontSize: 32, color: '#F8FAFC' },
    subtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#64748B', marginTop: 2 },
    headerButtons: { flexDirection: 'row', gap: 12 },
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1E293B',
        justifyContent: 'center',
        alignItems: 'center'
    },
    iconText: { fontSize: 20 },
    importBtn: { backgroundColor: '#38BDF8', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 20 },
    importText: { fontFamily: 'Inter_700Bold', color: '#0F172A' },
    list: { paddingBottom: 40 },
    emptyContainer: { alignItems: 'center', marginTop: 60 },
    emptyEmoji: { fontSize: 64, marginBottom: 16 },
    empty: { color: '#F8FAFC', fontSize: 20, fontFamily: 'Inter_700Bold', marginBottom: 8 },
    emptyHint: { color: '#64748B', fontSize: 14, fontFamily: 'Inter_400Regular' },
    card: {
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8
    },
    cardContent: { flex: 1 },
    deckName: { fontFamily: 'Lora_600SemiBold', fontSize: 20, color: '#E2E8F0', marginBottom: 4 },
    deckSub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#94A3B8' },
    cardRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    badge: { backgroundColor: '#F43F5E', minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
    badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    deleteBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#334155',
        justifyContent: 'center',
        alignItems: 'center'
    },
    deleteBtnText: { fontSize: 16 },
    hint: {
        textAlign: 'center',
        color: '#64748B',
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
        paddingBottom: 20
    }
});
