// screens/BarcodeScannerNative.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { Button, Card, Paragraph } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";

/*
  Fixed, defensive BarcodeScannerNative:
  - Handles new and old expo-image-picker response shapes
  - Uses safe permission checks (status/granted)
  - Guards ImageManipulator calls (only when uri is a string)
  - Builds FormData correctly for React Native
  - Graceful error alerts
*/

const BACKEND_URL = "https://models.samsarawellness.in/barcode/";

// Normalize ImagePicker result to a consistent small shape:
// returns { uri, width, height, fileName, type } or null
function normalizePickerResult(res) {
  if (!res) return null;

  // New API: { assets: [ { uri, width, height, fileName, type } ], canceled }
  if (Array.isArray(res.assets) && res.assets.length > 0) {
    const a = res.assets[0];
    return {
      uri: a.uri,
      width: a.width,
      height: a.height,
      fileName: a.fileName || (a.uri ? a.uri.split("/").pop() : undefined),
      type: a.type || (a.uri && a.uri.endsWith(".png") ? "image/png" : "image/jpeg"),
    };
  }

  // Older API: { uri, width, height, cancelled / canceled }
  if (res.uri) {
    return {
      uri: res.uri,
      width: res.width,
      height: res.height,
      fileName: undefined,
      type: undefined,
    };
  }

  return null;
}

// Resize/compress image safely. Returns { uri, width, height } or null
async function prepareImage(uri, maxWidth = 1600, compress = 0.8) {
  if (!uri || typeof uri !== "string") {
    // invalid uri -> return null (caller will fallback)
    return null;
  }

  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result;
  } catch (err) {
    // If manipulation fails, return fallback object with original uri
    console.warn("ImageManipulator failed; using original uri.", err?.message ?? err);
    return { uri };
  }
}

// Build file object suitable for FormData append in React Native
function buildFileForUpload(normalized) {
  if (!normalized || !normalized.uri) return null;
  const rawUri = normalized.uri;
  const uri = Platform.OS === "android" ? rawUri : rawUri.replace("file://", "");
  const name = normalized.fileName || (uri && uri.split("/").pop()) || `photo_${Date.now()}.jpg`;
  const extMatch = /\.(\w+)$/.exec(name);
  const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
  const mime = normalized.type || (ext === "png" ? "image/png" : "image/jpeg");
  return { uri, name, type: mime };
}

export default function BarcodeScannerNative({ navigation }) {
  const [image, setImage] = useState(null); // { uri, width, height, fileName, type }
  const [loading, setLoading] = useState(false);
  const [serverResult, setServerResult] = useState(null);
  const [savedFoods, setSavedFoods] = useState([]);

  useEffect(() => {
    (async () => {
      // load saved scans once
      try {
        const s = await AsyncStorage.getItem("SAVED_BARCODES");
        if (s) setSavedFoods(JSON.parse(s));
      } catch (err) {
        console.warn("Failed reading saved foods:", err);
      }
    })();
  }, []);

  const saveResult = async (item) => {
    try {
      const newArr = [item, ...savedFoods].slice(0, 50);
      setSavedFoods(newArr);
      await AsyncStorage.setItem("SAVED_BARCODES", JSON.stringify(newArr));
    } catch (err) {
      console.warn("Failed saving result:", err);
    }
  };

  // === Pick from gallery ===
  const pickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      // Newer API returns { status } while older may return { granted }
      if ((perm.status && perm.status !== "granted") || (perm.granted === false)) {
        Alert.alert("Permission required", "Please allow gallery access to choose an image.");
        return;
      }

      // Choose correct mediaTypes constant depending on SDK shape
      const mediaTypeConst = ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaTypeOptions;

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaTypeConst,
        quality: 1,
        base64: false,
      });

      // Support both 'canceled' and 'cancelled'
      if (res.canceled === true || res.cancelled === true) return;

      const normalized = normalizePickerResult(res);
      if (!normalized || !normalized.uri) {
        Alert.alert("No image", "Could not read the selected image. Try another image.");
        return;
      }

      // Attempt to compress/resize; if it fails, fall back to normalized
      const prepared = await prepareImage(normalized.uri);
      const final = prepared ? { ...prepared, fileName: normalized.fileName, type: normalized.type } : normalized;
      setImage(final);
      setServerResult(null);
    } catch (err) {
      console.error("pickFromGallery error:", err);
      Alert.alert("Error", "Failed to pick image. Try again.");
    }
  };

  // === Take photo ===
  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if ((perm.status && perm.status !== "granted") || (perm.granted === false)) {
        Alert.alert("Permission required", "Please allow camera access to take a photo.");
        return;
      }

      const mediaTypeConst = ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaTypeOptions;
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: mediaTypeConst,
        quality: 1,
        base64: false,
      });

      if (res.canceled === true || res.cancelled === true) return;

      const normalized = normalizePickerResult(res);
      if (!normalized || !normalized.uri) {
        Alert.alert("Camera failed", "Could not capture image. Try again.");
        return;
      }

      const prepared = await prepareImage(normalized.uri);
      const final = prepared ? { ...prepared, fileName: normalized.fileName, type: normalized.type } : normalized;
      setImage(final);
      setServerResult(null);
    } catch (err) {
      console.error("takePhoto error:", err);
      Alert.alert("Error", "Failed to take photo. Try again.");
    }
  };

  // === Upload image (tries field names 'file' then 'image') ===
  const uploadImage = async () => {
    if (!image || !image.uri) {
      Alert.alert("No image selected", "Tap 'Choose Image' to pick or take a barcode photo.");
      return;
    }

    const fileObj = buildFileForUpload(image);
    if (!fileObj) {
      Alert.alert("Invalid image", "Could not build upload file from selected image.");
      return;
    }

    const fields = ["file", "image"];
    setLoading(true);
    setServerResult(null);
    let lastError = null;

    try {
      for (const field of fields) {
        const fd = new FormData();
        fd.append(field, { uri: fileObj.uri, name: fileObj.name, type: fileObj.type });

        let resp;
        try {
          resp = await fetch(BACKEND_URL, { method: "POST", body: fd });
        } catch (netErr) {
          lastError = netErr;
          continue; // try next field or finish
        }

        if (resp.ok) {
          let parsed;
          try {
            parsed = await resp.json();
          } catch {
            parsed = { rawText: await resp.text().catch(() => "") };
          }
          const out = { method: "upload", field, status: resp.status, body: parsed, when: new Date().toISOString() };
          setServerResult(out);
          await saveResult(out);
          setLoading(false);
          return;
        } else {
          const txt = await resp.text().catch(() => "");
          lastError = new Error(`status ${resp.status}: ${txt}`);
        }
      }

      // none succeeded
      throw lastError || new Error("Upload failed");
    } catch (err) {
      console.error("uploadImage error:", err);
      Alert.alert("Upload failed", err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = () => {
    setImage(null);
    setServerResult(null);
  };

  // Render nutrition if available (best-effort)
  const renderNutrition = (body) => {
    if (!body) return null;
    const name = body.name || body.title || body.product_name || null;
    const calories = body.calories || (body.nutrition && body.nutrition.calories) || null;
    const nutrients = body.nutrients || body.nutrition || null;

    return (
      <View style={{ marginTop: 8 }}>
        {name && <Text style={{ fontSize: 18, fontWeight: "700" }}>{name}</Text>}
        {calories && <Text style={{ marginTop: 4 }}>Calories: {String(calories)}</Text>}
        {nutrients && typeof nutrients === "object" && (
          <View style={{ marginTop: 6 }}>
            <Text style={{ fontWeight: "600" }}>Nutrients</Text>
            {Object.entries(nutrients).map(([k, v]) => (
              <Text key={k}>
                {k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </Text>
            ))}
          </View>
        )}
        {!name && !calories && !nutrients && (
          <Text style={{ marginTop: 6 }}>No structured nutrition fields detected — showing raw below.</Text>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 12 }}>
      <Text style={styles.title}>Food Barcode Scanner</Text>
      <Text style={styles.subtitle}>Upload a photo of any food barcode to get nutritional information.</Text>

      <View style={styles.selectorRow}>
        <Button mode="contained" onPress={pickFromGallery} style={styles.btn}>
          Choose Image
        </Button>
        <Button mode="outlined" onPress={takePhoto} style={styles.btn}>
          Take Photo
        </Button>
      </View>

      <View style={{ marginTop: 12 }}>
        {image ? (
          <Card>
            <Card.Content style={{ alignItems: "center" }}>
              {image.uri ? (
                <Image source={{ uri: image.uri }} style={styles.previewImage} />
              ) : (
                <View style={[styles.previewImage, { justifyContent: "center", alignItems: "center" }]}>
                  <Text>No preview available</Text>
                </View>
              )}

              <Paragraph style={{ marginTop: 8 }}>
                {image.width ? `${image.width}×${image.height} • ` : ""}
                {image.uri ? image.uri.split("/").pop() : "unknown.jpg"}
              </Paragraph>
              <View style={{ flexDirection: "row", marginTop: 8 }}>
                <Button mode="contained" onPress={uploadImage} style={{ marginRight: 8 }}>
                  Scan Barcode
                </Button>
                <Button mode="text" onPress={clearSelection}>
                  Clear
                </Button>
              </View>
            </Card.Content>
          </Card>
        ) : (
          <Card style={{ padding: 12, alignItems: "center" }}>
            <Paragraph>Choose Image or Take Photo and then tap Scan Barcode.</Paragraph>
            <Paragraph style={{ marginTop: 8, color: "#666" }}>After choosing, tap Scan Barcode.</Paragraph>
          </Card>
        )}
      </View>

      {loading && (
        <View style={{ marginTop: 12, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8 }}>Scanning barcode and fetching nutrition data...</Text>
        </View>
      )}

      {serverResult && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: "700" }}>Result</Text>
          {renderNutrition(serverResult.body)}
          <Card style={{ marginTop: 10, padding: 10 }}>
            <Paragraph selectable>{JSON.stringify(serverResult.body, null, 2)}</Paragraph>
            <Paragraph style={{ marginTop: 8, color: "#666" }}>Field used: {serverResult.field}</Paragraph>
          </Card>
        </View>
      )}

      <View style={{ marginTop: 18 }}>
        <Text style={{ fontWeight: "700" }}>Saved Foods</Text>
        {savedFoods.length === 0 ? (
          <Paragraph style={{ marginTop: 8, color: "#666" }}>No saved scans yet.</Paragraph>
        ) : (
          savedFoods.map((s, idx) => (
            <Card key={idx} style={{ marginTop: 8, padding: 8 }}>
              <Paragraph numberOfLines={2}>{s.body && s.body.name ? s.body.name : JSON.stringify(s.body).slice(0, 120)}</Paragraph>
              <Paragraph style={{ color: "#666", marginTop: 6 }}>{new Date(s.when).toLocaleString()}</Paragraph>
            </Card>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 6 },
  subtitle: { color: "#444", marginBottom: 12 },
  selectorRow: { flexDirection: "row", justifyContent: "space-between" },
  btn: { flex: 1, marginHorizontal: 6 },
  previewImage: { width: 260, height: 140, borderRadius: 6, marginTop: 8 },
});
