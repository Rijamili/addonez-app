import React, { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";

import API from "../services/api";

export default function LoginScreen() {
  const navigation = useNavigation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

 const handleLogin = async () => {
  try {
    const response = await API.post("/auth/login", {
      email,
      password,
    });

    console.log("SUCCESS:", response.data);

    navigation.replace("Home");

  } catch (error) {
  console.log("ERROR:", error);
  console.log("MESSAGE:", error.message);
  console.log("RESPONSE:", error.response?.data);

  Alert.alert(
    "Login Error",
    error.message || "Unknown Error"
  );
}
};
  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.logo}>ADDONEZ</Text>
        <Text style={styles.subtitle}>
          ERP Client Dashboard
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Email</Text>

        <TextInput
          style={styles.input}
          placeholder="Enter Email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>

        <TextInput
          style={styles.input}
          placeholder="Enter Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.loginText}>
            {loading ? "Logging in..." : "Login"}
          </Text>
        </TouchableOpacity>

       <TouchableOpacity
  onPress={() =>
    navigation.navigate("ForgotPassword")
  }
>
  <Text style={styles.forgot}>
    Forgot Password?
  </Text>
</TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    justifyContent: "center",
    padding: 20,
  },

  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },

  logo: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#0A8F8F",
  },

  subtitle: {
    color: "#666",
    marginTop: 5,
  },

  form: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 15,
  },

  label: {
    marginBottom: 5,
    fontWeight: "600",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
  },

  loginButton: {
    backgroundColor: "#0A8F8F",
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
  },

  loginText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 16,
  },

  forgot: {
    textAlign: "center",
    marginTop: 15,
    color: "#0A8F8F",
  },
});