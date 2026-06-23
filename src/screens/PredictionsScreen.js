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

  useEffect(() => {
    fetch("http://localhost:5000/api/odoo/predictions")
      .then((res) => res.json())
      .then((data) => {
        setPrediction(data);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>
        Future Predictions
      </Text>

      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.label}>
            Predicted Revenue
          </Text>

          <Text style={styles.sub}>
            Next Month
          </Text>

          <Text style={styles.amount}>
            ₹
            {Number(
              prediction.predictedRevenue || 0
            ).toFixed(2)}
          </Text>

          <Text style={styles.growth}>
            ↑ {prediction.growth} growth
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Current Revenue
          </Text>

          <Text style={styles.sub}>
            Current Performance
          </Text>

          <Text style={styles.amount}>
            ₹
            {Number(
              prediction.currentRevenue || 0
            ).toFixed(2)}
          </Text>

          <Text style={styles.growth}>
            Live Odoo Revenue
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Predicted Orders
          </Text>

          <Text style={styles.sub}>
            Next Month
          </Text>

          <Text style={styles.amount}>
            {prediction.predictedOrders || 0}
          </Text>

          <Text style={styles.growth}>
            Based on Odoo Trends
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Current Orders
          </Text>

          <Text style={styles.sub}>
            Current Performance
          </Text>

          <Text style={styles.amount}>
            {prediction.currentOrders || 0}
          </Text>

          <Text style={styles.growth}>
            Live Odoo Orders
          </Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>
          AI Insight
        </Text>

        <Text style={styles.summaryText}>
  {prediction.insight}
</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FA",
    padding: 15,
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