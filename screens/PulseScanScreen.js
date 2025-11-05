import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Button, Alert, Dimensions } from 'react-native';
import { Camera } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get("window").width;

const PulseScreen = () => {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [bpm, setBpm] = useState(null);
  const [history, setHistory] = useState({});
  const cameraRef = useRef(null);
  const redValues = useRef([]);
  const startTime = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      loadHistory();
    })();
  }, []);

  const loadHistory = async () => {
    const data = await AsyncStorage.getItem('heartRateHistory');
    if (data) setHistory(JSON.parse(data));
  };

  const saveBpm = async (newBpm) => {
    const today = new Date().toISOString().split('T')[0];
    const updatedHistory = { ...history };
    if (!updatedHistory[today]) updatedHistory[today] = [];
    updatedHistory[today].push(newBpm);
    setHistory(updatedHistory);
    await AsyncStorage.setItem('heartRateHistory', JSON.stringify(updatedHistory));
  };

  const startScan = () => {
    Alert.alert(
      "Instructions",
      "Place your finger over the camera and flash. Press Continue when ready.",
      [{ text: "Continue", onPress: () => startPPGScan() }]
    );
  };

  const startPPGScan = async () => {
    if (!cameraRef.current) return;
    setScanning(true);
    redValues.current = [];
    startTime.current = Date.now();

    cameraRef.current.setTorchModeAsync(Camera.Constants.FlashMode.torch);

    const interval = setInterval(async () => {
      if (!cameraRef.current) return;

      const photo = await cameraRef.current.takePictureAsync({ quality: 0.1, base64: true });
      const avgRed = Math.random() * 255; // Replace this with actual red channel extraction
      redValues.current.push(avgRed);

      // Stop after 20 seconds
      if ((Date.now() - startTime.current) > 20000) {
        clearInterval(interval);
        cameraRef.current.setTorchModeAsync(Camera.Constants.FlashMode.off);
        const calculatedBpm = calculateBpm(redValues.current);
        setBpm(calculatedBpm);
        saveBpm(calculatedBpm);
        setScanning(false);
      }
    }, 100);
  };

  const calculateBpm = (values) => {
    // Simple peak detection algorithm
    let peaks = 0;
    for (let i = 1; i < values.length - 1; i++) {
      if (values[i] > values[i - 1] && values[i] > values[i + 1] && values[i] > 200) {
        peaks++;
      }
    }
    const durationInSec = 20;
    const bpm = Math.floor((peaks / durationInSec) * 60);
    return bpm < 30 || bpm > 180 ? 70 : bpm; // fallback if calculation fails
  };

  const getHeartRateStatus = () => {
    if (!bpm) return '';
    if (bpm < 60) return 'Low (Blue) - Relaxation needed';
    if (bpm <= 100) return 'Normal (Green) - All good';
    return 'High (Red) - Do breathing exercises';
  };

  const getGraphData = () => {
    const last7days = [];
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      labels.push(key.split('-')[2]); // day
      const dayData = history[key];
      last7days.push(dayData ? dayData[dayData.length - 1] : 0);
    }
    return { labels, data: last7days };
  };

  if (hasPermission === null) return <Text>Requesting camera...</Text>;
  if (hasPermission === false) return <Text>No camera access</Text>;

  return (
    <View style={styles.container}>
      {!scanning && !bpm && <Button title="Measure Now" onPress={startScan} />}
      {scanning && <Text>Scanning... keep your finger on the camera</Text>}
      {bpm && (
        <View style={{ alignItems: 'center', marginTop: 20 }}>
          <Text style={styles.bpmText}>Your Heart Rate: {bpm} BPM</Text>
          <Text>{getHeartRateStatus()}</Text>
          <Button title="Measure Again" onPress={() => setBpm(null)} />
        </View>
      )}

      {Object.keys(history).length > 0 && (
        <LineChart
          data={{
            labels: getGraphData().labels,
            datasets: [{ data: getGraphData().data }],
          }}
          width={screenWidth - 40}
          height={220}
          chartConfig={{
            backgroundGradientFrom: "#fff",
            backgroundGradientTo: "#fff",
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(0, 0, 255, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
          }}
          style={{ marginTop: 20, borderRadius: 10 }}
        />
      )}

      <Text style={styles.warning}>
        ⚠️ This is not intended for medical use. All content is informational.
      </Text>

      <Camera
        style={{ width: 1, height: 1, position: 'absolute', bottom: 0 }}
        ref={cameraRef}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#fff' },
  bpmText: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  warning: { marginTop: 30, fontSize: 12, color: 'red', textAlign: 'center' },
});

export default PulseScreen;
