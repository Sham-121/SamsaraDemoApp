import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import {
  CameraView,
  CameraType,
  useCameraPermissions,
} from "expo-camera";

// TODO: replace with your real backend URL:
// e.g. "http://192.168.0.101:8000/analyze_ppg_video"
const API_URL = "https://hrmppgbackend.onrender.com/analyze_ppg_video";

const MEASUREMENT_DURATION_SECONDS = 8;

const PulseScanScreen = () => {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [isRecording, setIsRecording] = useState(false);
  const [bpm, setBpm] = useState(null);
  const [error, setError] = useState(null);

  if (!permission) {
    // still loading permission state
    return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>
          We need camera permission to measure your heart rate.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={requestPermission}
        >
          <Text style={styles.primaryButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const uploadVideoAndGetBpm = async (uri) => {
    try {
      setError(null);
      setBpm(null);

      const fileName = uri.split("/").pop() || "ppg_video.mp4";

      const formData = new FormData();
      formData.append("file", {
        uri,
        name: fileName,
        type: "video/mp4", // usually fine; adjust if needed
      });

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data",
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.detail || "Server error while analyzing video";
        throw new Error(msg);
      }

      setBpm(data.bpm);
    } catch (err) {
      console.error("Upload/analyze error:", err);
      const msg = err.message || "Something went wrong";
      setError(msg);
      Alert.alert("Error", msg);
    }
  };

  const startMeasurement = async () => {
    if (!cameraRef.current) {
      Alert.alert("Error", "Camera not ready yet");
      return;
    }
    try {
      setIsRecording(true);
      setError(null);
      setBpm(null);

      // Record short video with torch on
      const video = await cameraRef.current.recordAsync({
        maxDuration: MEASUREMENT_DURATION_SECONDS,
        mute: true,           // no audio needed
        quality: "480p",      // small file
      });

      if (!video || !video.uri) {
        throw new Error("No video captured");
      }

      await uploadVideoAndGetBpm(video.uri);
    } catch (err) {
      if (err?.message?.includes("Another recording in progress")) {
        // common camera error, handle gracefully
        Alert.alert("Camera Busy", "Please try again.");
      } else if (err?.message && err.message !== "Aborted") {
        console.error("Recording error:", err);
        Alert.alert("Error", err.message);
      }
    } finally {
      // stopRecording is automatically called on maxDuration
      setIsRecording(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Camera preview */}
      <View style={styles.cameraWrapper}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          enableTorch={true}             // torch on while previewing/recording
          mode="video"
          mute={true}
        />
      </View>

      {/* UI overlay */}
      <View style={styles.overlay}>
        <Text style={styles.title}>Pulse Scanner</Text>
        <Text style={styles.subtitle}>
          Place your finger gently on the camera and flash and hold still while
          we record for {MEASUREMENT_DURATION_SECONDS} seconds.
        </Text>

        <View style={styles.card}>
          {isRecording ? (
            <>
              <ActivityIndicator size="large" />
              <Text style={styles.statusText}>
                Measuring... Keep your finger still.
              </Text>
            </>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={startMeasurement}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Start Measurement</Text>
            </TouchableOpacity>
          )}

          {bpm !== null && !isRecording && (
            <View style={styles.resultContainer}>
              <Text style={styles.resultLabel}>Heart Rate</Text>
              <Text style={styles.resultBpm}>{bpm} BPM</Text>
            </View>
          )}

          {error && !isRecording && (
            <Text style={styles.errorText}>Error: {error}</Text>
          )}
        </View>

        <View style={styles.tipsBox}>
          <Text style={styles.tipsTitle}>Tips</Text>
          <Text style={styles.tipItem}>• Remove any case if it covers the flash.</Text>
          <Text style={styles.tipItem}>• Don&apos;t press too hard.</Text>
          <Text style={styles.tipItem}>• Keep hand and phone as still as possible.</Text>
        </View>
      </View>
    </View>
  );
};

export default PulseScanScreen;

// --------- Styles ---------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  cameraWrapper: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 32,
    backgroundColor: "rgba(3,7,18,0.92)",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f9fafb",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: "#e5e7eb",
    textAlign: "center",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  statusText: {
    marginTop: 12,
    fontSize: 14,
    color: "#e5e7eb",
  },
  primaryButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  primaryButtonText: {
    color: "#f9fafb",
    fontSize: 15,
    fontWeight: "600",
  },
  resultContainer: {
    marginTop: 18,
    alignItems: "center",
  },
  resultLabel: {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 4,
  },
  resultBpm: {
    fontSize: 32,
    fontWeight: "800",
    color: "#22c55e",
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    color: "#f97373",
    textAlign: "center",
  },
  tipsBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#111827",
  },
  tipsTitle: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  tipItem: {
    color: "#9ca3af",
    fontSize: 12,
  },
  centered: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  permissionText: {
    color: "#e5e7eb",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
});
