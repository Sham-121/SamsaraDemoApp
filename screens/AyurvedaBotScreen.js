// screens/AyurvedaBotScreen.js
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";

const API_URL = "https://ayurveda-bot-backend.onrender.com/chat"; // Backend endpoint

const AyurvedaBotScreen = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef();

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage]; // Include the new message in history
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 50000); // Increased to 50s for assistant runs

      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }), // Send full history
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "⚠️ No reply from server." },
        ]);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Failed to connect to the bot." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Smooth auto-scroll
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 50);
  }, [messages]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 100}
    >
      <ScrollView
        style={styles.chatBox}
        contentContainerStyle={{ paddingVertical: 10 }}
        ref={scrollViewRef}
      >
        {messages.map((msg, index) => (
          <View
            key={index}
            style={[
              styles.messageContainer,
              msg.role === "user"
                ? styles.userMsgContainer
                : styles.botMsgContainer,
            ]}
          >
            <Text
              style={msg.role === "user" ? styles.userText : styles.botText}
            >
              {msg.content}
            </Text>
          </View>
        ))}

        {loading && (
          <View
            style={[
              styles.botMsgContainer,
              { flexDirection: "row", alignItems: "center" },
            ]}
          >
            <ActivityIndicator
              size="small"
              color="#555"
              style={{ marginRight: 8 }}
            />
            <Text style={{ color: "#555" }}>Bot is typing...</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputBox}>
        <TextInput
          style={styles.input}
          placeholder="Ask something about Ayurveda..."
          value={input}
          onChangeText={setInput}
          editable={!loading}
        />
        <TouchableOpacity
          style={styles.sendBtn}
          onPress={sendMessage}
          disabled={loading}
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    paddingBottom: 20,
  },
  chatBox: { flex: 1, paddingHorizontal: 10 },
  messageContainer: {
    maxWidth: "80%",
    padding: 12,
    marginVertical: 5,
    borderRadius: 15,
  },
  userMsgContainer: {
    alignSelf: "flex-end",
    backgroundColor: "#DCF8C6",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  botMsgContainer: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  userText: { color: "#000" },
  botText: { color: "#333" },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#eee",
    marginBottom: 10,
  },
  input: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
  },
  sendBtn: {
    backgroundColor: "#4CAF50",
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendText: { color: "#fff", fontWeight: "bold" },
});

export default AyurvedaBotScreen;
