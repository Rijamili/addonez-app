import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { API_URL } from "../config/api";

const screenWidth = Dimensions.get("window").width;

export default function DashboardScreen() {
  const [dashboard, setDashboard] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    quotations: 0,
  });

  const [user, setUser] = useState({
    name: "",
  });

  const [orders, setOrders] = useState([]);
  const [monthlySales, setMonthlySales] = useState([]);
  const [status, setStatus] = useState("Disconnected");

  useEffect(() => {
    loadDashboard();
    loadProfile();
    loadSales();
    loadMonthlySales();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await fetch(
        `${API_URL}/odoo/dashboard`
      );

      const data = await res.json();

      setDashboard(data);
      setStatus("Connected");
    } catch (error) {
      console.log(error);
      setStatus("Disconnected");
    }
  };

  const loadProfile = async () => {
    try {
      const res = await fetch(
        `${API_URL}/odoo/profile`
      );

      const data = await res.json();

      setUser(data);
    } catch (error) {
      console.log(error);
    }
  };

  const loadSales = async () => {
    try {
      const res = await fetch(
        `${API_URL}/odoo/sales`
      );

      const data = await res.json();

      setOrders(data);
    } catch (error) {
      console.log(error);
    }
  };

  const loadMonthlySales = async () => {
    try {
      const res = await fetch(
        `${API_URL}/odoo/monthly-sales`
      );

      const data = await res.json();

      setMonthlySales(data);
    } catch (error) {
      console.log(error);
    }
  };

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
          <Text style={styles.cardTitle}>
            Revenue
          </Text>

          <Text style={styles.cardValue}>
            ₹
            {Number(
              dashboard.totalRevenue || 0
            ).toLocaleString("en-IN")}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Orders
          </Text>

          <Text style={styles.cardValue}>
            {dashboard.totalOrders || 0}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Quotations
          </Text>

          <Text style={styles.cardValue}>
            {dashboard.quotations || 0}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Status
          </Text>

          <Text style={styles.cardValue}>
            {status}
          </Text>
        </View>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>
          Monthly Sales
        </Text>

        {monthlySales.length > 0 && (
          <LineChart
            data={{
              labels: monthlySales.map(
                (item) => item.month
              ),
              datasets: [
                {
                  data: monthlySales.map(
                    (item) =>
                      Number(item.amount || 0)
                  ),
                },
              ],
            }}
            width={screenWidth - 40}
            height={220}
            fromZero
            chartConfig={{
              backgroundGradientFrom:
                "#ffffff",
              backgroundGradientTo:
                "#ffffff",
              decimalPlaces: 0,
              color: (opacity = 1) =>
                `rgba(10,143,143,${opacity})`,
              labelColor: (opacity = 1) =>
                `rgba(0,0,0,${opacity})`,
            }}
            bezier
          />
        )}
      </View>

      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <Text style={styles.sectionTitle}>
            Top Sales Orders
          </Text>

          <Text style={styles.viewAll}>
            Live Odoo Data
          </Text>
        </View>

        {orders.map((item) => (
          <View
            key={item.id}
            style={styles.orderItem}
          >
            <Text>{item.name}</Text>

            <Text>
              ₹
              {Number(
                item.amount_total || 0
              ).toFixed(2)}
            </Text>
          </View>
        ))}
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
  },

  orderCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginTop: 15,
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
});