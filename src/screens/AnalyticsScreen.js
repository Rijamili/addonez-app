import React, { useEffect, useState } from "react";
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
  Dimensions,
} from "react-native";
import {
  LineChart,
  PieChart,
} from "react-native-chart-kit";

const screenWidth = Dimensions.get("window").width;

export default function AnalyticsScreen() {
  const [analytics, setAnalytics] = useState({
    totalRevenue: 0,
    totalOrders: 0,
  });
const [monthlySales, setMonthlySales] = useState([]);

  useEffect(() => {
  fetch("http://localhost:5000/api/odoo/monthly-sales")
    .then((res) => res.json())
    .then((data) => {
      setMonthlySales(data);
    })
    .catch((err) => console.log(err));
}, []);
  useEffect(() => {
    fetch("http://localhost:5000/api/odoo/analytics")
      .then((res) => res.json())
      .then((data) => {
        setAnalytics(data);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  const pieData = [
  {
    name: "Revenue",
    amount: analytics.totalRevenue,
    color: "#4DB6AC",
    legendFontSize: 12,
  },
  {
    name: "Orders",
    amount: analytics.totalOrders,
    color: "#80CBC4",
    legendFontSize: 12,
  },
];
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>
        Analytics
      </Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.title}>
            Revenue Analytics
          </Text>

          <Text style={styles.filter}>
            Live Odoo Data
          </Text>
        </View>

        <Text style={styles.revenue}>
          ₹{analytics.totalRevenue.toFixed(2)}
        </Text>

        <Text style={styles.orders}>
          Total Orders: {analytics.totalOrders}
        </Text>

        <LineChart
          data={{
           labels: monthlySales.map(
  (item) => item.month
),

datasets: [
  {
    data: monthlySales.map(
      (item) => item.amount
    ),
  },
],
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
          style={{
            borderRadius: 16,
            marginTop: 15,
          }}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>
          Sales Distribution
        </Text>

        <PieChart
          data={pieData}
          width={screenWidth - 40}
          height={220}
          accessor="amount"
          backgroundColor="transparent"
          paddingLeft="15"
          chartConfig={{
            color: () => "#000",
          }}
        />

        <Text>
          Revenue: ₹
          {analytics.totalRevenue.toFixed(2)}
        </Text>

        <Text>
          Orders: {analytics.totalOrders}
        </Text>

       <Text>
  Revenue: ₹{analytics.totalRevenue.toFixed(2)}
</Text>

<Text>
  Orders: {analytics.totalOrders}
</Text>
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
});