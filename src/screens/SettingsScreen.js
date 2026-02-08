import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@dutchflow_srs_settings';

const DEFAULT_SETTINGS = {
    requestRetention: 0.9,
    maximumInterval: 36500,
    w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61],
    easyBonus: 1.3,
    hardInterval: 1.2,
    newCardsPerDay: 20,
    reviewsPerDay: 200,
    cardsPerSession: 50
};

export default function SettingsScreen({ onSave }) {
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const stored = await AsyncStorage.getItem(SETTINGS_KEY);
            if (stored) {
                setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
            }
        } catch (e) {
            console.error("Error loading settings:", e);
        }
    };

    const saveSettings = async () => {
        try {
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            setHasChanges(false);
            Alert.alert("Saved", "Settings saved successfully!");
            if (onSave) onSave(settings);
        } catch (e) {
            console.error("Error saving settings:", e);
            Alert.alert("Error", "Failed to save settings");
        }
    };

    const resetToDefaults = () => {
        Alert.alert(
            "Reset Settings",
            "Are you sure you want to reset all settings to defaults?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Reset",
                    style: "destructive",
                    onPress: async () => {
                        setSettings(DEFAULT_SETTINGS);
                        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
                        setHasChanges(false);
                    }
                }
            ]
        );
    };

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.headerBrand}>
                <Text style={styles.brandTitle}>PELS</Text>
                <Text style={styles.brandSubtitle}>Pieter Experimental Language School</Text>
            </View>
            <Text style={styles.title}>⚙️ Settings</Text>

            {/* FSRS Parameters */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>FSRS Algorithm</Text>
                <Text style={styles.sectionDesc}>
                    These parameters control how the spaced repetition algorithm schedules your reviews.
                </Text>

                <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Request Retention</Text>
                        <Text style={styles.inputHint}>Target recall rate (0.7-0.97)</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={settings.requestRetention.toString()}
                        onChangeText={(text) => {
                            const val = parseFloat(text) || 0;
                            updateSetting('requestRetention', Math.max(0.7, Math.min(0.97, val)));
                        }}
                        keyboardType="decimal-pad"
                        placeholder="0.9"
                        placeholderTextColor="#64748B"
                    />
                </View>

                <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Maximum Interval</Text>
                        <Text style={styles.inputHint}>Days before card is shown again (max)</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={settings.maximumInterval.toString()}
                        onChangeText={(text) => {
                            const val = parseInt(text) || 365;
                            updateSetting('maximumInterval', Math.max(1, val));
                        }}
                        keyboardType="number-pad"
                        placeholder="36500"
                        placeholderTextColor="#64748B"
                    />
                </View>
            </View>

            {/* Daily Limits */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Daily Limits</Text>

                <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>New Cards per Day</Text>
                        <Text style={styles.inputHint}>Maximum new cards to introduce daily</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={settings.newCardsPerDay.toString()}
                        onChangeText={(text) => {
                            const val = parseInt(text) || 0;
                            updateSetting('newCardsPerDay', Math.max(0, val));
                        }}
                        keyboardType="number-pad"
                        placeholder="20"
                        placeholderTextColor="#64748B"
                    />
                </View>

                <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Reviews per Day</Text>
                        <Text style={styles.inputHint}>Maximum reviews per session</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={settings.reviewsPerDay.toString()}
                        onChangeText={(text) => {
                            const val = parseInt(text) || 0;
                            updateSetting('reviewsPerDay', Math.max(0, val));
                        }}
                        keyboardType="number-pad"
                        placeholder="200"
                        placeholderTextColor="#64748B"
                    />
                </View>

                <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Cards per Session</Text>
                        <Text style={styles.inputHint}>How many cards to load when you open a deck</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={settings.cardsPerSession?.toString() || ''}
                        onChangeText={(text) => {
                            // Allow empty during typing, store raw number
                            const val = text === '' ? '' : parseInt(text.replace(/[^0-9]/g, '')) || '';
                            updateSetting('cardsPerSession', val);
                        }}
                        onBlur={() => {
                            // Apply constraints when leaving the field
                            const val = parseInt(settings.cardsPerSession) || 50;
                            updateSetting('cardsPerSession', Math.max(1, Math.min(500, val)));
                        }}
                        keyboardType="number-pad"
                        placeholder="50"
                        placeholderTextColor="#64748B"
                    />
                </View>
            </View>

            {/* Interval Modifiers */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Interval Modifiers</Text>

                <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Easy Bonus</Text>
                        <Text style={styles.inputHint}>Multiplier for Easy rating</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={settings.easyBonus.toString()}
                        onChangeText={(text) => {
                            const val = parseFloat(text) || 1;
                            updateSetting('easyBonus', Math.max(1, val));
                        }}
                        keyboardType="decimal-pad"
                        placeholder="1.3"
                        placeholderTextColor="#64748B"
                    />
                </View>

                <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Hard Interval</Text>
                        <Text style={styles.inputHint}>Multiplier for Hard rating</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={settings.hardInterval.toString()}
                        onChangeText={(text) => {
                            const val = parseFloat(text) || 1;
                            updateSetting('hardInterval', Math.max(0.5, val));
                        }}
                        keyboardType="decimal-pad"
                        placeholder="1.2"
                        placeholderTextColor="#64748B"
                    />
                </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonRow}>
                <TouchableOpacity
                    style={[styles.button, styles.resetButton]}
                    onPress={resetToDefaults}
                >
                    <Text style={styles.resetButtonText}>Reset Defaults</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.button, styles.saveButton, !hasChanges && styles.buttonDisabled]}
                    onPress={saveSettings}
                    disabled={!hasChanges}
                >
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                </TouchableOpacity>
            </View>

            {/* Info */}
            <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>About FSRS</Text>
                <Text style={styles.infoText}>
                    FSRS (Free Spaced Repetition Scheduler) is a modern algorithm that uses machine learning to optimize your review schedule.
                    Higher retention means more frequent reviews but better recall. The default values work well for most learners.
                </Text>
            </View>
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
    section: {
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: 'Inter_700Bold',
        color: '#F8FAFC',
        marginBottom: 8
    },
    sectionDesc: {
        fontSize: 13,
        fontFamily: 'Inter_400Regular',
        color: '#64748B',
        marginBottom: 20
    },
    inputRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#334155'
    },
    inputGroup: {
        flex: 1,
        paddingRight: 16
    },
    inputLabel: {
        fontSize: 14,
        fontFamily: 'Inter_700Bold',
        color: '#E2E8F0',
        marginBottom: 4
    },
    inputHint: {
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
        color: '#64748B'
    },
    input: {
        backgroundColor: '#334155',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        width: 80,
        textAlign: 'center',
        color: '#F8FAFC',
        fontFamily: 'Inter_700Bold',
        fontSize: 16
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
        marginBottom: 24
    },
    button: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center'
    },
    resetButton: {
        backgroundColor: '#334155'
    },
    resetButtonText: {
        color: '#94A3B8',
        fontFamily: 'Inter_700Bold',
        fontSize: 14
    },
    saveButton: {
        backgroundColor: '#22C55E'
    },
    saveButtonText: {
        color: '#FFF',
        fontFamily: 'Inter_700Bold',
        fontSize: 14
    },
    buttonDisabled: {
        opacity: 0.5
    },
    infoBox: {
        backgroundColor: '#1E3A5F',
        borderRadius: 12,
        padding: 16,
        borderLeftWidth: 4,
        borderLeftColor: '#38BDF8'
    },
    infoTitle: {
        fontSize: 14,
        fontFamily: 'Inter_700Bold',
        color: '#38BDF8',
        marginBottom: 8
    },
    infoText: {
        fontSize: 13,
        fontFamily: 'Inter_400Regular',
        color: '#94A3B8',
        lineHeight: 20
    }
});

// Export function to get settings for use in scheduler
export const getSettings = async () => {
    try {
        const stored = await AsyncStorage.getItem(SETTINGS_KEY);
        if (stored) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.error("Error loading settings:", e);
    }
    return DEFAULT_SETTINGS;
};
