import api from "../services/api";
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
    api.get("/projects")
      .then((res) => setProjects(res.data.projects))
      .catch((err) => console.log(err));
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Projects</Text>

      {projects.length === 0 ? (
        <Text style={styles.loading}>Loading projects...</Text>
      ) : (
        projects.map((item, index) => (
          <View key={item.id || index} style={styles.card}>
            <Text style={styles.projectName}>{item.name}</Text>
            <Text style={styles.status}>
              Status: {item.last_update_status || "Active"}
            </Text>
            {item.date && (
              <Text style={styles.deadline}>
                Deadline: {item.date}
              </Text>
            )}
            {item.date_start && (
              <Text style={styles.startDate}>
                Start: {item.date_start}
              </Text>
            )}
          </View>
        ))
      )}
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
  loading: {
    textAlign: "center",
    color: "#999",
    marginTop: 40,
    fontSize: 16,
  },
  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  projectName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 6,
  },
  status: {
    color: "#0A8F8F",
    marginTop: 4,
    fontSize: 14,
  },
  deadline: {
    color: "#e74c3c",
    marginTop: 4,
    fontSize: 13,
  },
  startDate: {
    color: "#999",
    marginTop: 4,
    fontSize: 13,
  },
});