// App.js
import React from "react";
import { Provider as PaperProvider } from "react-native-paper";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import HomeScreen from "./screens/HomeScreen";
import InstructionsScreen from "./screens/InstructionsScreen";
import AyurvedaBotScreen from "./screens/AyurvedaBotScreen";
import BarcodeScannerNative from "./screens/BarcodeScannerNative";
import FoodScanner from "./screens/FoodScannerScreen"; // ensure filename matches

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <PaperProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: "PulseApp — Home" }} />
          <Stack.Screen name="Instructions" component={InstructionsScreen} />
          <Stack.Screen name="AyurvedaBot" component={AyurvedaBotScreen} />
          <Stack.Screen name="BarcodeScannerNative" component={BarcodeScannerNative} options={{ title: "Barcode Scanner" }} />
          <Stack.Screen name="FoodScanner" component={FoodScanner} options={{ title: "Food Scanner" }} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
