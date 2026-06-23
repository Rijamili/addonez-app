import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from "react-native";

export default function ProjectsScreen() {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/api/odoo/projects")
      .then((res) => res.json())
      .then((data) => {
        setProjects(data);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>
        Projects
      </Text>

      {projects.map((item) => (
        <View
          key={item.id}
          style={styles.card}
        >
          <Text style={styles.projectName}>
            {item.name}
          </Text>

          <Text style={styles.status}>
  {item.active ? "Active" : "Inactive"}
</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FB",
    padding: 15,
  },

  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
  },

  projectName: {
    fontSize: 18,
    fontWeight: "bold",
  },

  status: {
    color: "#0A8F8F",
    marginTop: 5,
  },
});