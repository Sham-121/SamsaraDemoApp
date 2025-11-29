// screens/PulseScanScreen.js
import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Linking,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from 'expo-file-system/legacy';

// 🔗 BACKEND URL
const API_URL = "https://hrmppgbackend.onrender.com/analyze_ppg_video";

export default function PulseScanScreen() {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bpm, setBpm] = useState(null);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState("");
  const [showCamera, setShowCamera] = useState(true);

  // Ask for permission when screen loads
  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleOpenSettings = () => {
    Alert.alert(
      "Camera Permission",
      "Camera access is blocked. Please enable it in system settings.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]
    );
  };

  const uploadVideoAndGetBpm = async (uri) => {
    try {
      console.log("📹 Video URI:", uri);
      setError(null);
      setBpm(null);

      // Check file exists and size
      const fileInfo = await FileSystem.getInfoAsync(uri);
      console.log("📁 File info:", fileInfo);
      
      if (!fileInfo.exists) {
        throw new Error("Video file not found");
      }
      
      const fileSizeMB = fileInfo.size / 1024 / 1024;
      console.log(`📏 File size: ${fileSizeMB.toFixed(2)} MB`);

      // Warn if file is very large
      if (fileSizeMB > 50) {
        setUploadProgress(`Uploading large file (${fileSizeMB.toFixed(0)}MB)... This may take a while`);
      } else {
        setUploadProgress("Uploading video...");
      }

      // Use expo-file-system for more reliable uploads
      console.log("📤 Uploading via FileSystem.uploadAsync...");

      const uploadResult = await FileSystem.uploadAsync(API_URL, uri, {
        fieldName: 'file',
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        uploadProgressCallback: (progress) => {
          const percent = (progress.totalBytesSent / progress.totalBytesExpectedToSend * 100).toFixed(0);
          console.log(`📊 Upload progress: ${percent}%`);
          setUploadProgress(`Uploading... ${percent}%`);
        },
      });

      console.log("📊 Upload complete! Status:", uploadResult.status);
      console.log("📄 Response body:", uploadResult.body);

      setUploadProgress("Analyzing heart rate...");

      let data;
      try {
        data = JSON.parse(uploadResult.body);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        throw new Error(`Server returned invalid response: ${uploadResult.body.substring(0, 100)}`);
      }

      console.log("✅ Parsed response:", data);

      if (uploadResult.status !== 200) {
        const msg = data.detail || data.message || `Server error: ${uploadResult.status}`;
        throw new Error(msg);
      }

      if (data.bpm) {
        setBpm(data.bpm);
        setUploadProgress("");
        setIsProcessing(false);
        Alert.alert("Success!", `Your heart rate is ${data.bpm} BPM`);
      } else {
        throw new Error("No BPM data in response");
      }
    } catch (err) {
      console.error("❌ Upload/analyze error:", err);
      const msg = err.message || "Something went wrong";
      setError(msg);
      setUploadProgress("");
      setIsProcessing(false);
      Alert.alert("Error", msg);
    }
  };

  const startMeasurement = async () => {
    if (!cameraRef.current) {
      Alert.alert("Error", "Camera not ready yet");
      return;
    }
    if (isRecording) {
      console.log("Already recording, ignoring start request");
      return;
    }

    console.log("🎬 Starting measurement…");
    setIsRecording(true);
    setError(null);
    setBpm(null);
    setUploadProgress("");
    setShowCamera(true);

    try {
      console.log("🔴 Calling recordAsync…");
      
      // Record video - user will manually stop
      const video = await cameraRef.current.recordAsync({
        mute: true,
        quality: '480p', // Lower quality to reduce file size
      });
      
      console.log("✅ recordAsync resolved:", video);

      if (!video || !video.uri) {
        throw new Error("No video captured");
      }

      // Hide camera and show processing
      setShowCamera(false);
      setIsProcessing(true);
      setUploadProgress("Processing video...");

      // Upload and analyze
      await uploadVideoAndGetBpm(video.uri);
    } catch (err) {
      console.error("❌ Recording error:", err);
      
      // Ignore "Aborted" errors (these happen when user stops recording)
      if (
        err?.message &&
        err.message !== "Aborted" &&
        !err.message.includes("stopRecording") &&
        !err.message.includes("Recording already stopped")
      ) {
        setError(err.message);
        setIsProcessing(false);
        setShowCamera(true);
        Alert.alert("Error", err.message);
      }
    } finally {
      setIsRecording(false);
      console.log("🏁 Measurement finished");
    }
  };

  const stopMeasurement = () => {
    if (!cameraRef.current) {
      console.log("No camera ref available");
      return;
    }
    if (!isRecording) {
      console.log("Not currently recording, ignoring stop request");
      return;
    }
    
    console.log("⏹️ Manually stopping recording");
    try {
      cameraRef.current.stopRecording();
    } catch (e) {
      console.log("stopRecording error (often harmless):", e);
    }
  };

  const resetForNewMeasurement = () => {
    setBpm(null);
    setError(null);
    setUploadProgress("");
    setIsProcessing(false);
    setShowCamera(true);
  };

  // 1) Permission loading
  if (!permission) {
    return <View style={styles.fullScreenDark} />;
  }

  // 2) Permission denied permanently
  if (!permission.granted && permission.canAskAgain === false) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionTitle}>Camera Permission Required</Text>
        <Text style={styles.permissionText}>
          Camera access has been denied. Please enable it in your device
          settings to measure your heart rate.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleOpenSettings}>
          <Text style={styles.primaryButtonText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 3) Permission not yet granted but we *can* ask
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
            const result = await requestPermission();
            console.log("Camera permission result:", result);
          }}
        >
          <Text style={styles.primaryButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 4) Permission granted → show camera + UI
  return (
    <View style={styles.container}>
      {showCamera ? (
        <View style={styles.cameraWrapper}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            mode="video"
            mute={true}
            enableTorch={isRecording} // Only enable torch when recording
          />
        </View>
      ) : (
        <View style={styles.processingView}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.processingText}>Processing your pulse data...</Text>
        </View>
      )}

      <View style={styles.overlay}>
        <Text style={styles.title}>Pulse Scanner</Text>
        <Text style={styles.subtitle}>
          {showCamera 
            ? "Place your finger gently on the camera and flash. Hold still for at least 10 seconds."
            : "Analyzing your heart rate..."
          }
        </Text>

        <View style={styles.card}>
          {isRecording ? (
            <>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>RECORDING</Text>
              </View>
              <Text style={styles.statusText}>
                Keep your finger still!
              </Text>
              <Text style={styles.statusSubtext}>
                Tap "Stop" after 10-15 seconds
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 12, backgroundColor: "#ef4444" }]}
                onPress={stopMeasurement}
              >
                <Text style={styles.primaryButtonText}>Stop Recording</Text>
              </TouchableOpacity>
            </>
          ) : isProcessing ? (
            <>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.statusText}>{uploadProgress}</Text>
              <Text style={styles.statusSubtext}>
                {uploadProgress.includes("Uploading") && "Please wait, this may take up to 60 seconds..."}
              </Text>
            </>
          ) : bpm !== null ? (
            <>
              <View style={styles.resultContainer}>
                <Text style={styles.resultLabel}>Heart Rate</Text>
                <Text style={styles.resultBpm}>{bpm} BPM</Text>
              </View>
              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 16, backgroundColor: "#3b82f6" }]}
                onPress={resetForNewMeasurement}
              >
                <Text style={styles.primaryButtonText}>Measure Again</Text>
              </TouchableOpacity>
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

          {error && !isRecording && !isProcessing && (
            <>
              <Text style={styles.errorText}>Error: {error}</Text>
              <TouchableOpacity
                style={[styles.primaryButton, { marginTop: 12, backgroundColor: "#3b82f6" }]}
                onPress={resetForNewMeasurement}
              >
                <Text style={styles.primaryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {showCamera && !bpm && (
          <View style={styles.tipsBox}>
            <Text style={styles.tipsTitle}>Tips for Best Results</Text>
            <Text style={styles.tipItem}>
              • Remove any case if it covers the flash
            </Text>
            <Text style={styles.tipItem}>
              • Cover both camera AND flash with your fingertip
            </Text>
            <Text style={styles.tipItem}>
              • Don't press too hard (light pressure)
            </Text>
            <Text style={styles.tipItem}>
              • Keep hand and phone completely still
            </Text>
            <Text style={styles.tipItem}>
              • Record for at least 10 seconds
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------- styles ----------
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
  processingView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#020617",
  },
  processingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#e5e7eb",
    fontWeight: "500",
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
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ef4444",
    marginRight: 8,
  },
  recordingText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ef4444",
    letterSpacing: 1,
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
  resultContainer: {
    marginTop: 8,
    alignItems: "center",
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