import api from "../services/api";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
  Dimensions,
} from "react-native";
import { LineChart, PieChart } from "react-native-chart-kit";

const screenWidth = Dimensions.get("window").width;

export default function AnalyticsScreen() {
  const [analytics, setAnalytics] = useState({
    totalRevenue: 0,
    totalOrders: 0,
  });
  const [monthlySales, setMonthlySales] = useState([]);

  useEffect(() => {
    api.get("/odoo/monthly-sales")
      .then((res) => setMonthlySales(res.data))
      .catch((err) => console.log(err));

    api.get("/odoo/analytics")
      .then((res) => setAnalytics(res.data))
      .catch((err) => console.log(err));
  }, []);

  const pieData = [
    {
      name: "Revenue",
      amount: analytics.totalRevenue || 1,
      color: "#4DB6AC",
      legendFontColor: "#666",
      legendFontSize: 12,
    },
    {
      name: "Orders",
      amount: analytics.totalOrders || 1,
      color: "#80CBC4",
      legendFontColor: "#666",
      legendFontSize: 12,
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Analytics</Text>

      {/* Revenue Card */}
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.title}>Revenue Analytics</Text>
          <Text style={styles.filter}>Live Odoo Data</Text>
        </View>

        <Text style={styles.revenue}>
          ₹{analytics.totalRevenue.toFixed(2)}
        </Text>

        <Text style={styles.orders}>
          Total Orders: {analytics.totalOrders}
        </Text>

        {monthlySales.length > 0 ? (
          <LineChart
            data={{
              labels: monthlySales.map((item) => item.month),
              datasets: [{ data: monthlySales.map((item) => item.amount) }],
            }}
            width={screenWidth - 60}
            height={220}
            chartConfig={{
              backgroundGradientFrom: "#fff",
              backgroundGradientTo: "#fff",
              decimalPlaces: 0,
              color: () => "#0A8F8F",
              labelColor: () => "#666",
            }}
            bezier
            style={{ borderRadius: 16, marginTop: 15 }}
          />
        ) : (
          <Text style={styles.loadingText}>Loading chart...</Text>
        )}
      </View>

      {/* Pie Chart Card */}
      <View style={styles.card}>
        <Text style={styles.title}>Sales Distribution</Text>

        {analytics.totalRevenue > 0 ? (
          <PieChart
            data={pieData}
            width={screenWidth - 40}
            height={220}
            accessor="amount"
            backgroundColor="transparent"
            paddingLeft="15"
            chartConfig={{ color: () => "#000" }}
          />
        ) : (
          <Text style={styles.loadingText}>Loading chart...</Text>
        )}

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Revenue:</Text>
          <Text style={styles.summaryValue}>
            ₹{analytics.totalRevenue.toFixed(2)}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Orders:</Text>
          <Text style={styles.summaryValue}>{analytics.totalOrders}</Text>
        </View>
      </View>
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
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  title: {
    fontWeight: "bold",
    fontSize: 18,
  },
  filter: {
    color: "#0A8F8F",
  },
  revenue: {
    fontSize: 30,
    fontWeight: "bold",
    marginBottom: 5,
  },
  orders: {
    color: "#666",
    marginBottom: 10,
  },
  loadingText: {
    textAlign: "center",
    color: "#999",
    marginTop: 20,
    marginBottom: 10,
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    marginTop: 8,
  },
  summaryLabel: {
    color: "#666",
    fontSize: 15,
  },
  summaryValue: {
    fontWeight: "bold",
    fontSize: 15,
    color: "#0A8F8F",
  },
});