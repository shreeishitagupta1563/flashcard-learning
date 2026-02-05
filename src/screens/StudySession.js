import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { getDB } from '../db';
import { createCardFromDb, nextCardState, Rating } from '../services/scheduler';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { PanResponder } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

export default function StudySession({ deck, onExit }) {
    const [queue, setQueue] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isFlipped, setIsFlipped] = useState(false);

    // Use a ref to track flipped state for PanResponder (fixes closure issue)
    const isFlippedRef = useRef(false);

    // Animation values using React Native Animated (Expo Go compatible)
    const flipAnimation = useRef(new Animated.Value(0)).current;
    const translateX = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        loadQueue();
    }, []);

    // Reset flip when card changes
    useEffect(() => {
        flipAnimation.setValue(0);
        translateX.setValue(0);
        setIsFlipped(false);
        isFlippedRef.current = false;
    }, [currentIdx]);

    const loadQueue = async () => {
        const db = await getDB();
        try {
            const res = await db.getAllAsync(`
                SELECT * FROM cards 
                WHERE deck_id = ? AND (due <= datetime('now') OR state = 0)
                ORDER BY due ASC LIMIT 20
            `, deck.id);
            const mapped = res.map(c => ({
                ...c,
                fsrsCard: createCardFromDb(c)
            }));
            setQueue(mapped);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Refs for state access in PanResponder closure
    const queueRef = useRef([]);
    const currentIdxRef = useRef(0);

    // Update refs when state changes
    useEffect(() => {
        queueRef.current = queue;
    }, [queue]);

    useEffect(() => {
        currentIdxRef.current = currentIdx;
    }, [currentIdx]);

    const handleRate = async (rating) => {
        const currentQ = queueRef.current;
        const currentI = currentIdxRef.current;

        if (!currentQ[currentI]) return;

        const currentCard = currentQ[currentI];
        const { card: newCard } = nextCardState(currentCard.fsrsCard, rating);

        const db = await getDB();
        await db.runAsync(`
            UPDATE cards SET 
                state = ?, due = ?, stability = ?, difficulty = ?, 
                elapsed_days = ?, scheduled_days = ?, reps = ?, lapses = ?, last_review = ?
            WHERE id = ?
        `,
            newCard.state, newCard.due.toISOString(), newCard.stability, newCard.difficulty,
            newCard.elapsed_days, newCard.scheduled_days, newCard.reps, newCard.lapses, newCard.last_review ? newCard.last_review.toISOString() : new Date().toISOString(),
            currentCard.id
        );

        // If Hard (or Again), add back to queue to repeat in this session
        if (rating === Rating.Hard || rating === Rating.Again) {
            // Create a copy of the card to act as the "repeat" instance
            // We might want to give it a temporary ID or just reuse, but simple reuse is fine for display
            // Ideally we shouldn't update DB for the repeat unless needed, but here we just want to see it again.
            const repeatCard = { ...currentCard, _isRepeat: true };
            const updatedQueue = [...currentQ, repeatCard];
            setQueue(updatedQueue);
            // queueRef will update via effect, but for immediate logic we know length grew
            setCurrentIdx(currentI + 1);
        } else {
            // Easy/Good
            if (currentI < currentQ.length - 1) {
                setCurrentIdx(currentI + 1);
            } else {
                onExit();
            }
        }
    };

    const handleTapFlip = () => {
        if (!isFlippedRef.current) {
            Animated.spring(flipAnimation, {
                toValue: 1,
                friction: 8,
                tension: 10,
                useNativeDriver: true
            }).start();
            setIsFlipped(true);
            isFlippedRef.current = true;
        }
    };

    const handleSwipeComplete = (direction) => {
        if (direction === 'right') {
            handleRate(Rating.Easy);
        } else {
            handleRate(Rating.Hard);
        }
    };

    // Pan responder for swipe gestures - uses isFlippedRef for correct state access
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                return isFlippedRef.current && Math.abs(gestureState.dx) > 10;
            },
            onPanResponderMove: (evt, gestureState) => {
                if (isFlippedRef.current) {
                    translateX.setValue(gestureState.dx);
                }
            },
            onPanResponderRelease: (evt, gestureState) => {
                if (isFlippedRef.current) {
                    if (gestureState.dx > SWIPE_THRESHOLD) {
                        Animated.timing(translateX, {
                            toValue: SCREEN_WIDTH,
                            duration: 200,
                            useNativeDriver: true
                        }).start(() => handleSwipeComplete('right'));
                    } else if (gestureState.dx < -SWIPE_THRESHOLD) {
                        Animated.timing(translateX, {
                            toValue: -SCREEN_WIDTH,
                            duration: 200,
                            useNativeDriver: true
                        }).start(() => handleSwipeComplete('left'));
                    } else {
                        Animated.spring(translateX, {
                            toValue: 0,
                            useNativeDriver: true
                        }).start();
                    }
                }
            }
        })
    ).current;

    // Front face rotation (0 -> 90 degrees, then hide)
    const frontRotate = flipAnimation.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['0deg', '90deg', '90deg']
    });

    const frontOpacity = flipAnimation.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 0, 0]
    });

    // Back face rotation (90 -> 0 degrees)
    const backRotate = flipAnimation.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['90deg', '90deg', '0deg']
    });

    const backOpacity = flipAnimation.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0, 1]
    });

    if (loading) return (
        <View style={styles.container}>
            <View style={styles.center}>
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        </View>
    );

    if (queue.length === 0) return (
        <View style={styles.container}>
            <View style={styles.center}>
                <Text style={styles.doneEmoji}>🎉</Text>
                <Text style={styles.doneTitle}>All Caught Up!</Text>
                <Text style={styles.doneSubtitle}>Great job. Come back later.</Text>
                <TouchableOpacity onPress={onExit} style={styles.homeBtn}>
                    <Text style={styles.homeBtnText}>Back to Decks</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const card = queue[currentIdx];

    // Clean text for display (remove HTML and sound tags)
    const cleanText = (text) => {
        if (!text) return '';
        return text
            .replace(/\[sound:[^\]]+\]/g, '')
            .replace(/<[^>]+>/g, '')
            .trim();
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onExit} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{deck.name}</Text>
                <Text style={styles.progressText}>{currentIdx + 1}/{queue.length}</Text>
            </View>

            {/* Progress dots */}
            <View style={styles.progressDots}>
                {queue.slice(0, Math.min(queue.length, 10)).map((_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            i < currentIdx ? styles.dotComplete :
                                i === currentIdx ? styles.dotActive : styles.dotInactive
                        ]}
                    />
                ))}
            </View>

            {/* Swipe hints (only when flipped) */}
            {isFlipped && (
                <View style={styles.swipeHints}>
                    <Text style={styles.swipeHintLeft}>← Hard</Text>
                    <Text style={styles.swipeHintCenter}>Swipe to rate</Text>
                    <Text style={styles.swipeHintRight}>Easy →</Text>
                </View>
            )}

            {/* Card Container */}
            <View style={styles.cardContainer}>
                <Animated.View
                    style={[styles.cardWrapper, { transform: [{ translateX }] }]}
                    {...panResponder.panHandlers}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={handleTapFlip}
                        style={styles.cardTouchable}
                    >
                        {/* Front Face - Question */}
                        <Animated.View style={[
                            styles.card,
                            styles.cardFront,
                            {
                                transform: [{ perspective: 1000 }, { rotateY: frontRotate }],
                                opacity: frontOpacity
                            }
                        ]}>
                            <Text style={styles.cardLabel}>TAP TO REVEAL</Text>
                            <Text style={styles.cardText}>{cleanText(card.question)}</Text>
                        </Animated.View>

                        {/* Back Face - Answer */}
                        <Animated.View style={[
                            styles.card,
                            styles.cardBack,
                            {
                                transform: [{ perspective: 1000 }, { rotateY: backRotate }],
                                opacity: backOpacity
                            }
                        ]}>
                            <View style={styles.answerContent}>
                                <Text style={styles.questionReminder}>{cleanText(card.question)}</Text>
                                <View style={styles.answerDivider} />
                                <Text style={styles.answerText}>{cleanText(card.answer)}</Text>
                            </View>
                        </Animated.View>
                    </TouchableOpacity>
                </Animated.View>
            </View>

            {/* Rating buttons (only when flipped) */}

        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#38BDF8',
        paddingTop: 60
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    loadingText: {
        color: '#0F172A',
        fontSize: 18,
        fontFamily: 'Inter_700Bold'
    },
    doneEmoji: {
        fontSize: 64,
        marginBottom: 16
    },
    doneTitle: {
        fontSize: 32,
        fontFamily: 'Inter_900Black',
        color: '#0F172A',
        marginBottom: 8
    },
    doneSubtitle: {
        fontSize: 16,
        fontFamily: 'Inter_400Regular',
        color: '#0369A1',
        marginBottom: 32
    },
    homeBtn: {
        paddingVertical: 16,
        paddingHorizontal: 32,
        backgroundColor: '#0F172A',
        borderRadius: 30
    },
    homeBtnText: {
        color: '#FFF',
        fontFamily: 'Inter_700Bold',
        fontSize: 16
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 10
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    closeBtnText: {
        fontSize: 18,
        color: '#0F172A',
        fontWeight: 'bold'
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Inter_700Bold',
        color: '#0F172A'
    },
    progressText: {
        fontSize: 16,
        fontFamily: 'Inter_700Bold',
        color: '#0369A1'
    },
    progressDots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        marginBottom: 20
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4
    },
    dotComplete: {
        backgroundColor: '#0F172A'
    },
    dotActive: {
        backgroundColor: '#FFF',
        width: 24
    },
    dotInactive: {
        backgroundColor: 'rgba(255,255,255,0.4)'
    },
    swipeHints: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 10
    },
    swipeHintLeft: {
        color: '#B91C1C',
        fontFamily: 'Inter_700Bold',
        fontSize: 12
    },
    swipeHintCenter: {
        color: '#0369A1',
        fontFamily: 'Inter_400Regular',
        fontSize: 11
    },
    swipeHintRight: {
        color: '#15803D',
        fontFamily: 'Inter_700Bold',
        fontSize: 12
    },
    cardContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20
    },
    cardWrapper: {
        width: '100%',
        height: SCREEN_HEIGHT * 0.45
    },
    cardTouchable: {
        width: '100%',
        height: '100%'
    },
    card: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 32,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
        backfaceVisibility: 'hidden'
    },
    cardFront: {},
    cardBack: {},
    cardLabel: {
        position: 'absolute',
        top: 20,
        fontSize: 10,
        fontFamily: 'Inter_700Bold',
        color: '#94A3B8',
        letterSpacing: 2
    },
    cardText: {
        fontSize: 36,
        fontFamily: 'Lora_700Bold',
        color: '#0F172A',
        textAlign: 'center'
    },
    answerContent: {
        width: '100%',
        alignItems: 'center'
    },
    questionReminder: {
        fontSize: 18,
        fontFamily: 'Inter_400Regular',
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 16
    },
    answerDivider: {
        width: 60,
        height: 3,
        backgroundColor: '#38BDF8',
        borderRadius: 2,
        marginBottom: 16
    },
    answerText: {
        fontSize: 32,
        fontFamily: 'Lora_700Bold',
        color: '#0F172A',
        textAlign: 'center'
    },

});
