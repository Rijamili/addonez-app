import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";

export default function SplashScreen({ navigation }) {

  useEffect(() => {
    setTimeout(() => {
      navigation.replace("Login");
    }, 3000);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>
        ADDONEZ
      </Text>

      <Text style={styles.sub}>
        ERP Client Dashboard
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A8F8F",
    justifyContent: "center",
    alignItems: "center",
  },

  logo: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "bold",
  },

  sub: {
    color: "#fff",
    marginTop: 10,
  },
});