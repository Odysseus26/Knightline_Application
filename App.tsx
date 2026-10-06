import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';

import { empty_boolean } from './components/utils/types';
import { isFirstTime, markFirstTimeComplete } from './components/utils/firstTime';
import MapParent from './screens/Map/Map_Parent';

function LoadingAnimation() {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, scale]);

  return (
    <View style={styles.loadingContainer}>
      <StatusBar style="auto" />
      <Animated.View style={{ opacity: fade, transform: [{ scale }] }}>
        <Image
          source={require('./assets/Bus_First_Logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
      <Text style={styles.header}>The Free Rutgers Bus App</Text>
      <ActivityIndicator size="large" color="#CC0033" style={styles.spinner} />
    </View>
  );
}


function WelcomeScreen({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <View style={styles.welcomeContainer}>
      <Text style={styles.title}>Welcome!</Text>

      <Text style={styles.subtitle}>
        This is your first time here. Let's get you set up.
      </Text>

      <Pressable
        onPress={onGetStarted}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>Get Started</Text>
      </Pressable>
    </View>
  );
}


export default function App() {
  const [loaded, setLoaded] = useState<boolean>(false);
  const [firstTime, setFirstTime] = useState<empty_boolean>(null);


  useEffect(() => {
    let mounted = true;
    (async () => {
      const value = await isFirstTime();
      if (!mounted) return;
      setFirstTime(value);
      setLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);


  async function handleGetStarted() {
    await markFirstTimeComplete();
    setFirstTime(false);
  }


  if (!loaded || firstTime === null) return <LoadingAnimation />;

  if (firstTime) return <WelcomeScreen onGetStarted={handleGetStarted} />;

  return <MapParent />;
}


const styles = StyleSheet.create({

  loadingContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    width: 200,
    height: 100,
  },
  header: {
    fontWeight: 'bold',
    fontSize: 18,
    marginTop: 20,
    padding: 10,
    color: '#000',
  },
  spinner: {
    marginTop: 16,
  },

  // --- Welcome ---
  welcomeContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#CC0033',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});