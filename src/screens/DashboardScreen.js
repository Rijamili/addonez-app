import api from "../services/api";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { LineChart } from "react-native-chart-kit";

const screenWidth = Dimensions.get("window").width;

export default function DashboardScreen() {
  const [dashboard, setDashboard] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    quotations: 0,
  });
  const [user, setUser] = useState({ name: "" });
  const [orders, setOrders] = useState([]);
  const [monthlySales, setMonthlySales] = useState([]);
  const [status, setStatus] = useState("Disconnected");

  useEffect(() => {
    api.get("/odoo/dashboard")
      .then((res) => {
        setDashboard(res.data);
        setStatus("Connected");
      })
      .catch((err) => {
        console.log(err);
        setStatus("Disconnected");
      });

    api.get("/odoo/profile")
      .then((res) => setUser(res.data))
      .catch((err) => console.log(err));

    api.get("/odoo/sales")
      .then((res) => setOrders(res.data))
      .catch((err) => console.log(err));

    api.get("/odoo/monthly-sales")
      .then((res) => setMonthlySales(res.data))
      .catch((err) => console.log(err));
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.greeting}>
        Hello, {user.name || "Odoo User"} 👋
      </Text>
      <Text style={styles.subTitle}>
        Here's your business overview
      </Text>

      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Revenue</Text>
          <Text style={styles.cardValue}>
            ₹{Number(dashboard.totalRevenue || 0).toLocaleString("en-IN")}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Orders</Text>
          <Text style={styles.cardValue}>
            {dashboard.totalOrders || 0}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quotations</Text>
          <Text style={styles.cardValue}>
            {dashboard.quotations || 0}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status</Text>
          <Text style={[
            styles.cardValue,
            { color: status === "Connected" ? "#00A86B" : "#E53935" }
          ]}>
            {status}
          </Text>
        </View>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Monthly Sales</Text>

        {monthlySales.length > 0 ? (
          <LineChart
            data={{
              labels: monthlySales.map((item) => item.month),
              datasets: [{
                data: monthlySales.map((item) => Number(item.amount || 0)),
              }],
            }}
            width={screenWidth - 40}
            height={220}
            fromZero
            chartConfig={{
              backgroundGradientFrom: "#ffffff",
              backgroundGradientTo: "#ffffff",
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(10,143,143,${opacity})`,
              labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
            }}
            bezier
          />
        ) : (
          <Text style={styles.loadingText}>Loading chart...</Text>
        )}
      </View>

      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <Text style={styles.sectionTitle}>Top Sales Orders</Text>
          <Text style={styles.viewAll}>Live Odoo Data</Text>
        </View>

        {orders.length === 0 ? (
          <Text style={styles.loadingText}>Loading orders...</Text>
        ) : (
          orders.map((item) => (
            <View key={item.id} style={styles.orderItem}>
              <Text style={styles.orderName}>{item.name}</Text>
              <Text style={styles.orderAmount}>
                ₹{Number(item.amount_total || 0).toFixed(2)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    padding: 15,
  },
  greeting: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subTitle: {
    color: "#666",
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  card: {
    width: "48%",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    color: "#666",
  },
  cardValue: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 5,
  },
  chartCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  orderCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginTop: 15,
    marginBottom: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  viewAll: {
    color: "#0A8F8F",
  },
  orderItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  orderName: {
    fontSize: 15,
    flex: 1,
  },
  orderAmount: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#0A8F8F",
  },
  loadingText: {
    textAlign: "center",
    color: "#999",
    marginVertical: 20,
    fontSize: 14,
  },
});