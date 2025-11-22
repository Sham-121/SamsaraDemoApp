// screens/FoodScannerScreen.js
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import { Button, Card, Paragraph } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

/*
  Fixed FoodScannerScreen:
  - All async functions declared async (no 'await' outside async)
  - Handles new/old ImagePicker response shapes (assets/canceled vs cancelled)
  - Uses ImagePicker.MediaType when available (avoids deprecated warning)
  - Uploads multipart field 'image' to /food/api/analyze
  - Parses and displays the foods & totals
*/

const ANALYZE_URL = "https://models.samsarawellness.in/food/api/analyze";

async function prepareImage(uri, maxWidth = 1600, compress = 0.8) {
  if (!uri || typeof uri !== "string") return { uri };
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result;
  } catch (err) {
    console.warn("prepareImage failed, using original uri:", err);
    return { uri };
  }
}

function fileObjectFromUri(uri) {
  const parts = uri.split("/");
  const name = parts[parts.length - 1] || `photo.jpg`;
  const extMatch = /\.(\w+)$/.exec(name);
  const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  return {
    uri: Platform.OS === "android" ? uri : uri.replace("file://", ""),
    name,
    type: mime,
  };
}

function parseGrams(str) {
  if (!str && str !== 0) return 0;
  try {
    const cleaned = String(str).replace(/[^\d.-]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

export default function FoodScannerScreen({ navigation }) {
  const [image, setImage] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Normalize various image picker response shapes to { uri, width, height, fileName, type } or null
  function normalizePickerResult(res) {
    if (!res) return null;
    // new shape: { assets: [ { uri, width, height, fileName, type } ], canceled }
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
    // old shape: { uri, width, height, cancelled }
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

  // pick from gallery (async)
  const pickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if ((perm.status && perm.status !== "granted") || (perm.granted === false)) {
        Alert.alert("Permission required", "Please grant gallery access.");
        return;
      }

      // use modern constant if available, fallback otherwise
      const mediaTypeConst =
        ImagePicker.MediaType?.Images ??
        (ImagePicker.MediaTypeOptions && ImagePicker.MediaTypeOptions.Images) ??
        ImagePicker.MediaTypeOptions;

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaTypeConst,
        quality: 1,
        base64: false,
      });

      // debug log to console (helps when things differ per SDK)
      console.log("PICKER RESULT:", res);

      // support both 'canceled' and 'cancelled'
      if (res.canceled === true || res.cancelled === true) return;

      const normalized = normalizePickerResult(res);
      if (!normalized || !normalized.uri) {
        Alert.alert("No image", "Could not read the selected image. Try another image.");
        return;
      }

      const prepared = await prepareImage(normalized.uri);
      setImage(prepared);
      setResult(null);
      setErrorMsg(null);
    } catch (err) {
      console.error("pickFromGallery error:", err);
      Alert.alert("Error", "Could not pick image. Try again.");
    }
  };

  // take photo (async)
  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if ((perm.status && perm.status !== "granted") || (perm.granted === false)) {
        Alert.alert("Permission required", "Please grant camera access.");
        return;
      }

      const mediaTypeConst =
        ImagePicker.MediaType?.Images ??
        (ImagePicker.MediaTypeOptions && ImagePicker.MediaTypeOptions.Images) ??
        ImagePicker.MediaTypeOptions;

      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: mediaTypeConst,
        quality: 1,
        base64: false,
      });

      console.log("CAMERA RESULT:", res);

      if (res.canceled === true || res.cancelled === true) return;

      const normalized = normalizePickerResult(res);
      if (!normalized || !normalized.uri) {
        Alert.alert("Camera failed", "Could not capture image. Try again.");
        return;
      }

      const prepared = await prepareImage(normalized.uri);
      setImage(prepared);
      setResult(null);
      setErrorMsg(null);
    } catch (err) {
      console.error("takePhoto error:", err);
      Alert.alert("Error", "Could not take photo. Try again.");
    }
  };

  const uploadToBackend = async () => {
    if (!image || !image.uri) {
      Alert.alert("No image", "Pick or take a photo first.");
      return;
    }

    setAnalyzing(true);
    setResult(null);
    setErrorMsg(null);

    try {
      const fileObj = fileObjectFromUri(image.uri);

      const form = new FormData();
      form.append("image", {
        uri: fileObj.uri,
        name: fileObj.name,
        type: fileObj.type,
      });

      const resp = await fetch(ANALYZE_URL, {
        method: "POST",
        body: form,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Server returned ${resp.status}: ${text}`);
      }

      let parsed;
      try {
        parsed = await resp.json();
      } catch (err) {
        const txt = await resp.text().catch(() => "");
        throw new Error("Server returned non-JSON response: " + txt);
      }

      if (!parsed || !Array.isArray(parsed.foods)) {
        throw new Error("Unexpected response shape from server");
      }

      setResult(parsed);
    } catch (err) {
      console.error("uploadToBackend error:", err);
      setErrorMsg(err.message || "Upload failed");
      Alert.alert("Upload failed", err.message || "Unknown error");
    } finally {
      setAnalyzing(false);
    }
  };

  const computeTotals = (foods = []) => {
    const totals = { carbs: 0, fat: 0, fiber: 0, protein: 0 };
    foods.forEach((f) => {
      totals.carbs += parseGrams(f.carbs);
      totals.fat += parseGrams(f.fat);
      totals.fiber += parseGrams(f.fiber);
      totals.protein += parseGrams(f.protein);
    });
    const fmt = (n) => `${Number(n).toFixed(2)}g`;
    return {
      carbs: fmt(totals.carbs),
      fat: fmt(totals.fat),
      fiber: fmt(totals.fiber),
      protein: fmt(totals.protein),
    };
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>Food Scanner</Text>

      <View style={styles.row}>
        <Button mode="contained" onPress={takePhoto} style={styles.btn}>
          Take Photo
        </Button>
        <Button mode="outlined" onPress={pickFromGallery} style={styles.btn}>
          Gallery
        </Button>
      </View>

      {image && (
        <View style={styles.preview}>
          <Image source={{ uri: image.uri }} style={styles.image} resizeMode="cover" />
          <Text style={styles.meta}>
            {image.width ? `${image.width}×${image.height} • ` : ""}
            {image.uri.split("/").pop()}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={uploadToBackend}
          disabled={!image || analyzing}
          style={styles.actionBtn}
        >
          {analyzing ? "Analyzing..." : "Analyze Food"}
        </Button>

        <Button
          mode="outlined"
          onPress={() => {
            setImage(null);
            setResult(null);
            setErrorMsg(null);
          }}
          style={styles.actionBtn}
        >
          Reset
        </Button>
      </View>

      {analyzing && (
        <View style={{ marginTop: 12, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8 }}>Uploading & analyzing…</Text>
        </View>
      )}

      {errorMsg ? (
        <Card style={styles.resultBox}>
          <Paragraph style={{ color: "#b00020" }}>Error: {errorMsg}</Paragraph>
        </Card>
      ) : null}

      {result && result.foods && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 8 }}>Detected foods</Text>

          {result.foods.map((f, idx) => (
            <Card key={idx} style={{ marginBottom: 10 }}>
              <Card.Content>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontWeight: "700", fontSize: 15 }}>{f.name || `Item ${idx + 1}`}</Text>
                  <Text style={{ color: "#666", fontSize: 12 }}>per gram</Text>
                </View>

                <View style={{ marginTop: 8 }}>
                  <View style={styles.rowN}>
                    <View style={styles.nCell}>
                      <Text style={styles.nLabel}>Carbs</Text>
                      <Text style={styles.nValue}>{f.carbs || "-"}</Text>
                    </View>
                    <View style={styles.nCell}>
                      <Text style={styles.nLabel}>Fat</Text>
                      <Text style={styles.nValue}>{f.fat || "-"}</Text>
                    </View>
                    <View style={styles.nCell}>
                      <Text style={styles.nLabel}>Protein</Text>
                      <Text style={styles.nValue}>{f.protein || "-"}</Text>
                    </View>
                    <View style={styles.nCell}>
                      <Text style={styles.nLabel}>Fiber</Text>
                      <Text style={styles.nValue}>{f.fiber || "-"}</Text>
                    </View>
                  </View>
                </View>
              </Card.Content>
            </Card>
          ))}

          <Card style={{ marginTop: 6, padding: 8 }}>
            <Card.Content>
              <Text style={{ fontWeight: "700", marginBottom: 8 }}>Totals (sum per gram)</Text>
              <View style={[styles.rowN, { justifyContent: "space-around" }]}>
                {Object.entries(computeTotals(result.foods)).map(([k, v]) => (
                  <View key={k} style={{ alignItems: "center" }}>
                    <Text style={{ color: "#666", fontSize: 12 }}>{k.toUpperCase()}</Text>
                    <Text style={{ fontWeight: "700", marginTop: 4 }}>{v}</Text>
                  </View>
                ))}
              </View>
            </Card.Content>
          </Card>
        </View>
      )}

      <Button mode="text" onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
        Back
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  btn: { flex: 1, marginHorizontal: 6 },
  preview: { alignItems: "center", marginVertical: 12 },
  image: { width: 320, height: 240, borderRadius: 8 },
  meta: { marginTop: 8, color: "#444" },
  actions: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  actionBtn: { flex: 1, marginHorizontal: 6 },
  resultBox: { marginTop: 16, padding: 12, backgroundColor: "#fff5f5", borderRadius: 8 },
  rowN: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  nCell: { flex: 1, alignItems: "center" },
  nLabel: { color: "#666", fontSize: 12 },
  nValue: { fontWeight: "700", marginTop: 4 },
});
