import React, { useState, useEffect } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

export default function ProfileScreen() {
  const navigation = useNavigation();

  const [profileImage, setProfileImage] = useState(null);

  const [user, setUser] = useState({
    name: "",
    email: "",
    company: "",
  });

  useEffect(() => {
    fetch("http://localhost:5000/api/odoo/profile")
      .then((res) => res.json())
      .then((data) => {
        setUser(data);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const handleLogout = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "Login" }],
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileCard}>
        <TouchableOpacity onPress={pickImage}>
          <Image
            source={
              profileImage
                ? { uri: profileImage }
                : {
                    uri: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
                  }
            }
            style={styles.avatar}
          />
        </TouchableOpacity>

        <Text style={styles.changePhoto}>
          Tap profile photo to change
        </Text>

        <Text style={styles.name}>
          {user.name || "Loading..."}
        </Text>

        <Text style={styles.email}>
          {user.email || "Loading..."}
        </Text>

        <Text style={styles.role}>
          Odoo User
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Account Information
        </Text>

        <View style={styles.item}>
          <Text style={styles.label}>Company</Text>
          <Text>{user.company}</Text>
        </View>

        <View style={styles.item}>
          <Text style={styles.label}>Email</Text>
          <Text>{user.email}</Text>
        </View>

        <View style={styles.item}>
          <Text style={styles.label}>ERP System</Text>
          <Text>Odoo ERP</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Settings
        </Text>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() =>
            Alert.alert(
              "Notifications",
              "Notifications Settings"
            )
          }
        >
          <Text>Notifications</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() =>
            Alert.alert(
              "Security",
              "Security Settings"
            )
          }
        >
          <Text>Security</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() =>
            Alert.alert(
              "ERP Preferences",
              "ERP Preferences"
            )
          }
        >
          <Text>ERP Preferences</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() =>
            Alert.alert(
              "Help & Support",
              "Help & Support"
            )
          }
        >
          <Text>Help & Support</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
      >
        <Text style={styles.logoutText}>
          Logout
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FB",
  },

  profileCard: {
    backgroundColor: "#fff",
    alignItems: "center",
    padding: 25,
    marginBottom: 15,
  },

  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#0A8F8F",
  },

  changePhoto: {
    marginTop: 10,
    color: "#0A8F8F",
    fontSize: 13,
  },

  name: {
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 10,
  },

  email: {
    color: "#666",
    marginTop: 5,
  },

  role: {
    color: "#0A8F8F",
    marginTop: 5,
    fontWeight: "600",
  },

  section: {
    backgroundColor: "#fff",
    marginBottom: 15,
    padding: 15,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },

  item: {
    marginBottom: 12,
  },

  label: {
    color: "#666",
    marginBottom: 3,
  },

  menuItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },

  logoutBtn: {
    backgroundColor: "#E53935",
    margin: 15,
    padding: 15,
    borderRadius: 10,
  },

  logoutText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },
});