import React from "react";
import {
  View,
  Text,
  Linking,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

export default function AIInsightsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        AI Business Insights
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          Linking.openURL(
            "https://ai-power.streamlit.app/"
          )
        }
      >
        <Text style={styles.buttonText}>
          Open AI Insights
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },

  button: {
    backgroundColor: "#0A8F8F",
    padding: 15,
    borderRadius: 10,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
});