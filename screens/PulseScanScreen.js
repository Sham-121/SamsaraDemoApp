// screens/PulseScanScreen.js
import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

// 🔗 CHANGE THIS TO YOUR RENDER URL
const API_URL = "https://hrmppgbackend.onrender.com/analyze_ppg_video";

// Seconds to record
const RECORD_DURATION = 8;

export default function PulseScanScreen() {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [bpm, setBpm] = useState(null);
  const [error, setError] = useState(null);

  const handleStartScan = async () => {
    if (!permission || !permission.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          "Permission required",
          "Camera permission is needed to measure your pulse."
        );
        return;
      }
    }

    if (!cameraRef.current) {
      Alert.alert("Camera not ready", "Please wait a moment and try again.");
      return;
    }

    setError(null);
    setBpm(null);
    setIsRecording(true);

    try {
      // Record a short video (no audio needed)
      const video = await cameraRef.current.recordAsync({
        maxDuration: RECORD_DURATION,
        quality: "480p",
        mute: true,
      });

      setIsRecording(false);

      if (!video || !video.uri) {
        throw new Error("No video captured.");
      }

      // Upload to backend
      await uploadVideo(video.uri);
    } catch (e) {
      console.error("Recording error:", e);
      setIsRecording(false);
      setIsUploading(false);
      setError(e.message || "Recording failed");
      Alert.alert("Error", e.message || "Recording failed");
    }
  };

  const uploadVideo = async (uri) => {
    try {
      setIsUploading(true);

      console.log("Uploading video:", uri);

      const formData = new FormData();
      formData.append("file", {
        uri,
        name: "ppg_clip.mp4",
        type: "video/mp4",
      });

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
        },
        body: formData,
      });

      const data = await response.json();
      console.log("Backend response:", response.status, data);

      if (!response.ok) {
        const msg = data.detail || "Unable to calculate heart rate";
        throw new Error(msg);
      }

      setBpm(data.bpm);
      setIsUploading(false);

      Alert.alert("Measurement complete", `Your heart rate is ${data.bpm} BPM`);
    } catch (e) {
      console.error("Upload / analysis error:", e);
      setIsUploading(false);
      setError(e.message || "Failed to analyze video");
      Alert.alert("Error", e.message || "Failed to analyze video");
    }
  };

  const renderPermission = () => {
    if (!permission) {
      return <View style={styles.fullScreenDark} />;
    }

    if (!permission.granted && permission.canAskAgain === false) {
      return (
        <View style={styles.centered}>
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            Camera access has been denied. Please enable it from system settings.
          </Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.centered}>
          <Text style={styles.permissionTitle}>We need your permission</Text>
          <Text style={styles.permissionText}>
            Allow camera access so we can use the rear camera and flashlight to
            measure your pulse.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={async () => {
              await requestPermission();
            }}
          >
            <Text style={styles.primaryButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  const permissionView = renderPermission();
  if (permissionView) {
    return permissionView;
  }

  return (
    <View style={styles.container}>
      <View style={styles.cameraWrapper}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          mode="video"
          enableTorch={isRecording} // turn flash on while recording
        />
      </View>

      <View style={styles.overlay}>
        <Text style={styles.title}>Pulse Scanner</Text>
        <Text style={styles.subtitle}>
          Place your fingertip over the rear camera and flash.
        </Text>

        <View style={styles.card}>
          {isRecording && (
            <>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>
                  Recording {RECORD_DURATION}s…
                </Text>
              </View>
              <Text style={styles.statusSubtext}>
                Keep your finger steady covering camera and flash.
              </Text>
            </>
          )}

          {isUploading && !isRecording && (
            <>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.statusText}>Analyzing your pulse…</Text>
              <Text style={styles.statusSubtext}>
                This usually takes just a few seconds.
              </Text>
            </>
          )}

          {!isRecording && !isUploading && bpm !== null && (
            <>
              <Text style={styles.resultLabel}>Heart Rate</Text>
              <Text style={styles.resultBpm}>{bpm} BPM</Text>
              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 16 }]}
                onPress={() => {
                  setBpm(null);
                  setError(null);
                }}
              >
                <Text style={styles.primaryButtonText}>Measure Again</Text>
              </TouchableOpacity>
            </>
          )}

          {!isRecording && !isUploading && bpm === null && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleStartScan}
              disabled={isRecording || isUploading}
            >
              <Text style={styles.primaryButtonText}>
                Start {RECORD_DURATION}s Scan
              </Text>
            </TouchableOpacity>
          )}

          {error && !isRecording && !isUploading && (
            <Text style={styles.errorText}>{error}</Text>
          )}
        </View>

        {!bpm && !isRecording && !isUploading && (
          <View style={styles.tipsBox}>
            <Text style={styles.tipsTitle}>Tips for best results</Text>
            <Text style={styles.tipItem}>• Cover BOTH camera and flash</Text>
            <Text style={styles.tipItem}>• Don’t press too hard</Text>
            <Text style={styles.tipItem}>
              • Hold steady for the full {RECORD_DURATION} seconds
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreenDark: {
    flex: 1,
    backgroundColor: "#020617",
  },
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
  primaryButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#f9fafb",
    fontSize: 15,
    fontWeight: "600",
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ef4444",
    marginRight: 8,
  },
  recordingText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ef4444",
  },
  statusText: {
    marginTop: 12,
    fontSize: 14,
    color: "#e5e7eb",
    fontWeight: "600",
    textAlign: "center",
  },
  statusSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
  },
  resultLabel: {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 4,
  },
  resultBpm: {
    fontSize: 40,
    fontWeight: "800",
    color: "#22c55e",
  },
  errorText: {
    marginTop: 10,
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
    marginBottom: 6,
  },
  tipItem: {
    color: "#9ca3af",
    fontSize: 12,
    marginBottom: 2,
  },
  centered: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  permissionTitle: {
    color: "#f9fafb",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  permissionText: {
    color: "#cbd5f5",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
});
