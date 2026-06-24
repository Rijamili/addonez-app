import api from "../services/api";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
} from "react-native";

export default function PredictionsScreen() {
  const [prediction, setPrediction] = useState({
    currentRevenue: 0,
    currentOrders: 0,
    predictedRevenue: 0,
    predictedOrders: 0,
    growth: "0%",
    insight: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/odoo/predictions")
      .then((res) => {
        setPrediction(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading predictions...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Future Predictions</Text>

      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.label}>Predicted Revenue</Text>
          <Text style={styles.sub}>Next Month</Text>
          <Text style={styles.amount}>
            ₹{Number(prediction.predictedRevenue || 0).toFixed(2)}
          </Text>
          <Text style={styles.growth}>↑ {prediction.growth} growth</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Current Revenue</Text>
          <Text style={styles.sub}>Current Performance</Text>
          <Text style={styles.amount}>
            ₹{Number(prediction.currentRevenue || 0).toFixed(2)}
          </Text>
          <Text style={styles.growth}>Live Odoo Revenue</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Predicted Orders</Text>
          <Text style={styles.sub}>Next Month</Text>
          <Text style={styles.amount}>
            {prediction.predictedOrders || 0}
          </Text>
          <Text style={styles.growth}>Based on Odoo Trends</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Current Orders</Text>
          <Text style={styles.sub}>Current Performance</Text>
          <Text style={styles.amount}>
            {prediction.currentOrders || 0}
          </Text>
          <Text style={styles.growth}>Live Odoo Orders</Text>
        </View>
      </View>

      {prediction.insight ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>AI Insight</Text>
          <Text style={styles.summaryText}>{prediction.insight}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FA",
    padding: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F7F8FA",
  },
  loadingText: {
    color: "#999",
    fontSize: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    color: "#555",
  },
  sub: {
    color: "#888",
    marginTop: 4,
    marginBottom: 12,
  },
  amount: {
    fontSize: 24,
    fontWeight: "bold",
  },
  growth: {
    color: "#00A86B",
    marginTop: 10,
  },
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginTop: 10,
    marginBottom: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  summaryText: {
    color: "#555",
    lineHeight: 22,
  },
});