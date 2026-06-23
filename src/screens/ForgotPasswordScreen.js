import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");

  const handleReset = () => {
    if (!email) {
      Alert.alert("Error", "Enter your email");
      return;
    }

    Alert.alert(
      "Password Reset",
      `Reset link sent to ${email}`
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Forgot Password
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Enter Email"
        value={email}
        onChangeText={setEmail}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleReset}
      >
        <Text style={styles.buttonText}>
          Send Reset Link
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#F5F7FA",
  },

  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
  },

  button: {
    backgroundColor: "#0A8F8F",
    marginTop: 20,
    padding: 15,
    borderRadius: 10,
  },

  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },
});