import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { getDB } from '../db';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function StatsScreen() {
    const [stats, setStats] = useState({
        totalCards: 0,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        totalDecks: 0,
        cardsStudiedToday: 0,
        avgDifficulty: 0,
        avgStability: 0,
        masteredCards: 0
    });
    const [deckStats, setDeckStats] = useState([]);
    const [weeklyProgress, setWeeklyProgress] = useState([]);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        const db = await getDB();
        try {
            // Overall stats - Only count cards linked to actual decks
            const totalResult = await db.getAllAsync(
                'SELECT COUNT(c.id) as count FROM cards c JOIN decks d ON c.deck_id = d.id'
            );
            const newResult = await db.getAllAsync(
                'SELECT COUNT(c.id) as count FROM cards c JOIN decks d ON c.deck_id = d.id WHERE c.state = 0'
            );
            const learningResult = await db.getAllAsync(
                'SELECT COUNT(c.id) as count FROM cards c JOIN decks d ON c.deck_id = d.id WHERE c.state = 1'
            );
            const reviewResult = await db.getAllAsync(
                'SELECT COUNT(c.id) as count FROM cards c JOIN decks d ON c.deck_id = d.id WHERE c.state = 2 OR c.state = 3'
            );
            const decksResult = await db.getAllAsync('SELECT COUNT(*) as count FROM decks');

            // Cards studied today
            const today = new Date().toISOString().split('T')[0];
            const studiedTodayResult = await db.getAllAsync(
                `SELECT COUNT(*) as count FROM cards WHERE last_review IS NOT NULL AND date(last_review) = date('now')`
            );

            // Average difficulty and stability for reviewed cards
            const avgResult = await db.getAllAsync(
                `SELECT AVG(difficulty) as avgDiff, AVG(stability) as avgStab FROM cards WHERE reps > 0`
            );

            // Mastered cards (high stability, low difficulty)
            const masteredResult = await db.getAllAsync(
                `SELECT COUNT(*) as count FROM cards WHERE stability > 30 AND state = 2`
            );

            setStats({
                totalCards: totalResult[0]?.count || 0,
                newCards: newResult[0]?.count || 0,
                learningCards: learningResult[0]?.count || 0,
                reviewCards: reviewResult[0]?.count || 0,
                totalDecks: decksResult[0]?.count || 0,
                cardsStudiedToday: studiedTodayResult[0]?.count || 0,
                avgDifficulty: avgResult[0]?.avgDiff || 0,
                avgStability: avgResult[0]?.avgStab || 0,
                masteredCards: masteredResult[0]?.count || 0
            });

            // Per-deck stats
            const deckStatsResult = await db.getAllAsync(`
                SELECT d.name, 
                       COUNT(c.id) as total,
                       SUM(CASE WHEN c.state = 0 THEN 1 ELSE 0 END) as new_count,
                       SUM(CASE WHEN c.state = 1 THEN 1 ELSE 0 END) as learning_count,
                       SUM(CASE WHEN c.state = 2 OR c.state = 3 THEN 1 ELSE 0 END) as review_count
                FROM decks d
                LEFT JOIN cards c ON c.deck_id = d.id
                GROUP BY d.id
            `);
            setDeckStats(deckStatsResult);

            // Weekly progress (last 7 days)
            const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const weeklyData = [];

            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const dayName = weekDays[date.getDay()];

                const dayResult = await db.getAllAsync(
                    `SELECT COUNT(*) as count FROM cards WHERE last_review IS NOT NULL AND date(last_review) = ?`,
                    [dateStr]
                );

                weeklyData.push({
                    day: dayName,
                    count: dayResult[0]?.count || 0,
                    isToday: i === 0
                });
            }

            setWeeklyProgress(weeklyData);

        } catch (e) {
            console.error("Error loading stats:", e);
        }
    };

    const getProgressWidth = (value, total) => {
        if (total === 0) return 0;
        return (value / total) * 100;
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.headerBrand}>
                <Text style={styles.brandTitle}>PELS</Text>
                <Text style={styles.brandSubtitle}>Pieter Experimental Language School</Text>
            </View>
            <Text style={styles.title}>📊 Statistics</Text>

            {/* Summary Cards */}
            <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, { backgroundColor: '#3B82F6' }]}>
                    <Text style={styles.summaryNumber}>{stats.totalCards}</Text>
                    <Text style={styles.summaryLabel}>Total Cards</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#22C55E' }]}>
                    <Text style={styles.summaryNumber}>{stats.cardsStudiedToday}</Text>
                    <Text style={styles.summaryLabel}>Studied Today</Text>
                </View>
            </View>

            <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, { backgroundColor: '#8B5CF6' }]}>
                    <Text style={styles.summaryNumber}>{stats.totalDecks}</Text>
                    <Text style={styles.summaryLabel}>Decks</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#F59E0B' }]}>
                    <Text style={styles.summaryNumber}>{stats.masteredCards}</Text>
                    <Text style={styles.summaryLabel}>Mastered</Text>
                </View>
            </View>

            {/* Weekly Progress Bar Chart */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Weekly Progress</Text>
                <View style={styles.chartContainer}>
                    {weeklyProgress.map((day, index) => {
                        const maxCount = Math.max(...weeklyProgress.map(d => d.count), 1);
                        const barHeight = (day.count / maxCount) * 120;
                        return (
                            <View key={index} style={styles.barContainer}>
                                <Text style={styles.barValue}>{day.count}</Text>
                                <View style={styles.barWrapper}>
                                    <View
                                        style={[
                                            styles.bar,
                                            {
                                                height: Math.max(barHeight, 4),
                                                backgroundColor: day.isToday ? '#38BDF8' : '#3B82F6'
                                            }
                                        ]}
                                    />
                                </View>
                                <Text style={[
                                    styles.barLabel,
                                    day.isToday && styles.barLabelToday
                                ]}>{day.day}</Text>
                            </View>
                        );
                    })}
                </View>
                <Text style={styles.chartHint}>Cards reviewed per day</Text>
            </View>

            {/* Card States Breakdown */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Card States</Text>

                <View style={styles.stateRow}>
                    <View style={styles.stateInfo}>
                        <View style={[styles.stateDot, { backgroundColor: '#60A5FA' }]} />
                        <Text style={styles.stateLabel}>New</Text>
                    </View>
                    <Text style={styles.stateValue}>{stats.newCards}</Text>
                </View>
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${getProgressWidth(stats.newCards, stats.totalCards)}%`, backgroundColor: '#60A5FA' }]} />
                </View>

                <View style={styles.stateRow}>
                    <View style={styles.stateInfo}>
                        <View style={[styles.stateDot, { backgroundColor: '#FBBF24' }]} />
                        <Text style={styles.stateLabel}>Learning</Text>
                    </View>
                    <Text style={styles.stateValue}>{stats.learningCards}</Text>
                </View>
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${getProgressWidth(stats.learningCards, stats.totalCards)}%`, backgroundColor: '#FBBF24' }]} />
                </View>

                <View style={styles.stateRow}>
                    <View style={styles.stateInfo}>
                        <View style={[styles.stateDot, { backgroundColor: '#34D399' }]} />
                        <Text style={styles.stateLabel}>Review</Text>
                    </View>
                    <Text style={styles.stateValue}>{stats.reviewCards}</Text>
                </View>
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${getProgressWidth(stats.reviewCards, stats.totalCards)}%`, backgroundColor: '#34D399' }]} />
                </View>
            </View>

            {/* Learning Metrics */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Learning Metrics</Text>
                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Avg. Difficulty</Text>
                    <Text style={styles.metricValue}>{stats.avgDifficulty.toFixed(2)}</Text>
                </View>
                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Avg. Stability (days)</Text>
                    <Text style={styles.metricValue}>{stats.avgStability.toFixed(1)}</Text>
                </View>
            </View>

            {/* Per Deck Stats */}
            {deckStats.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>By Deck</Text>
                    {deckStats.map((deck, index) => (
                        <View key={index} style={styles.deckStatCard}>
                            <Text style={styles.deckStatName}>{deck.name}</Text>
                            <View style={styles.deckStatRow}>
                                <Text style={styles.deckStatItem}>📘 {deck.new_count} new</Text>
                                <Text style={styles.deckStatItem}>📙 {deck.learning_count} learning</Text>
                                <Text style={styles.deckStatItem}>📗 {deck.review_count} review</Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A'
    },
    content: {
        padding: 20,
        paddingTop: 60,
        paddingBottom: 40
    },
    title: {
        fontSize: 24,
        fontFamily: 'Inter_700Bold',
        color: '#F8FAFC',
        marginBottom: 24
    },
    headerBrand: {
        marginBottom: 16
    },
    brandTitle: {
        fontSize: 32,
        fontFamily: 'Inter_900Black',
        color: '#F8FAFC'
    },
    brandSubtitle: {
        fontSize: 11,
        fontFamily: 'Inter_400Regular',
        color: '#64748B',
        marginTop: 2
    },
    summaryRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12
    },
    summaryCard: {
        flex: 1,
        padding: 20,
        borderRadius: 16,
        alignItems: 'center'
    },
    summaryNumber: {
        fontSize: 36,
        fontFamily: 'Inter_900Black',
        color: '#FFF'
    },
    summaryLabel: {
        fontSize: 12,
        fontFamily: 'Inter_700Bold',
        color: 'rgba(255,255,255,0.8)',
        marginTop: 4
    },
    section: {
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 20,
        marginTop: 20
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: 'Inter_700Bold',
        color: '#F8FAFC',
        marginBottom: 16
    },
    chartContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        height: 160,
        paddingTop: 20
    },
    barContainer: {
        flex: 1,
        alignItems: 'center'
    },
    barValue: {
        fontSize: 11,
        fontFamily: 'Inter_700Bold',
        color: '#94A3B8',
        marginBottom: 4
    },
    barWrapper: {
        height: 120,
        justifyContent: 'flex-end',
        width: '100%',
        paddingHorizontal: 4
    },
    bar: {
        width: '100%',
        borderRadius: 4,
        minHeight: 4
    },
    barLabel: {
        fontSize: 11,
        fontFamily: 'Inter_400Regular',
        color: '#64748B',
        marginTop: 8
    },
    barLabelToday: {
        color: '#38BDF8',
        fontFamily: 'Inter_700Bold'
    },
    chartHint: {
        fontSize: 11,
        fontFamily: 'Inter_400Regular',
        color: '#64748B',
        textAlign: 'center',
        marginTop: 16
    },
    stateRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
    },
    stateInfo: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    stateDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 8
    },
    stateLabel: {
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
        color: '#94A3B8'
    },
    stateValue: {
        fontSize: 16,
        fontFamily: 'Inter_700Bold',
        color: '#F8FAFC'
    },
    progressBar: {
        height: 6,
        backgroundColor: '#334155',
        borderRadius: 3,
        marginBottom: 16,
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        borderRadius: 3
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#334155'
    },
    metricLabel: {
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
        color: '#94A3B8'
    },
    metricValue: {
        fontSize: 16,
        fontFamily: 'Inter_700Bold',
        color: '#38BDF8'
    },
    deckStatCard: {
        backgroundColor: '#334155',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12
    },
    deckStatName: {
        fontSize: 16,
        fontFamily: 'Inter_700Bold',
        color: '#F8FAFC',
        marginBottom: 8
    },
    deckStatRow: {
        flexDirection: 'row',
        gap: 12
    },
    deckStatItem: {
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
        color: '#94A3B8'
    }
});
