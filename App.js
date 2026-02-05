import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, Alert, TouchableOpacity } from 'react-native';
import { useEffect, useState } from 'react';
import { useFonts, Inter_400Regular, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { Lora_400Regular, Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';
import { initDB } from './src/db';
import * as DocumentPicker from 'expo-document-picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { importAnkiPackage } from './src/services/AnkiImporter';
import DeckList from './src/screens/DeckList';
import StudySession from './src/screens/StudySession';
import StatsScreen from './src/screens/StatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_700Bold, Inter_900Black,
    Lora_400Regular, Lora_600SemiBold, Lora_700Bold
  });

  const [currentDeck, setCurrentDeck] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('home'); // 'home', 'stats', 'settings'
  const [dbReady, setDbReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    initDB().then(() => setDbReady(true)).catch(e => console.error("DB Init Error", e));
  }, []);

  const handleImport = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });

      if (res.canceled) return;

      const file = res.assets[0];
      if (!file.name.endsWith('.apkg')) {
        Alert.alert("Invalid File", "Please select a valid .apkg Anki file.");
        return;
      }

      setLoading(true);
      setTimeout(async () => {
        try {
          await importAnkiPackage(file.uri);
          Alert.alert("Success", "Deck imported successfully!");
          setLoading(false);
        } catch (e) {
          setLoading(false);
          Alert.alert("Error", "Import failed: " + e.message);
        }
      }, 100);

    } catch (e) {
      setLoading(false);
      Alert.alert("Error", e.message);
    }
  };

  const handleLoadDemo = async () => {
    setLoading(true);
    try {
      const asset = Asset.fromModule(require('./assets/start.apkg'));
      await asset.downloadAsync();
      await importAnkiPackage(asset.localUri || asset.uri);
      Alert.alert("Success", "Desktop Deck imported!");
      setLoading(false);
    } catch (e) {
      setLoading(false);
      Alert.alert("Error", "Demo Import failed: " + e.message);
    }
  };

  if (!fontsLoaded || !dbReady) return <View style={styles.container}><StatusBar style="light" /></View>;

  // Render current screen
  const renderScreen = () => {
    if (currentDeck) {
      return <StudySession deck={currentDeck} onExit={() => setCurrentDeck(null)} />;
    }

    switch (currentScreen) {
      case 'stats':
        return (
          <View style={styles.screenContainer}>
            <TouchableOpacity style={styles.backButton} onPress={() => setCurrentScreen('home')}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <StatsScreen />
          </View>
        );
      case 'settings':
        return (
          <View style={styles.screenContainer}>
            <TouchableOpacity style={styles.backButton} onPress={() => setCurrentScreen('home')}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <SettingsScreen onSave={() => { }} />
          </View>
        );
      default:
        return (
          <DeckList
            key={loading}
            onSelectDeck={setCurrentDeck}
            onImport={handleImport}
            onLoadDemo={handleLoadDemo}
            onOpenStats={() => setCurrentScreen('stats')}
            onOpenSettings={() => setCurrentScreen('settings')}
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {loading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Importing Deck...</Text>
          <Text style={styles.loadingSub}>This might take a moment.</Text>
        </View>
      )}
      {renderScreen()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  screenContainer: {
    flex: 1
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 100,
    backgroundColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20
  },
  backButtonText: {
    color: '#F8FAFC',
    fontFamily: 'Inter_700Bold',
    fontSize: 14
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100
  },
  loadingText: {
    color: '#FFF', fontFamily: 'Inter_700Bold', fontSize: 24, marginBottom: 8
  },
  loadingSub: {
    color: '#94A3B8', fontFamily: 'Inter_400Regular', fontSize: 16
  }
});
