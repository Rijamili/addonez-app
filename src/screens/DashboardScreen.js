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
  const [totalOrders, setTotalOrders] = useState(0);
  const [quotations, setQuotations] = useState(0);
  const [monthlySales, setMonthlySales] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [orders, setOrders] = useState([]);
 const [status, setStatus] = useState("Disconnected");
  const [user, setUser] = useState({
    name: "",
  });
  

  useEffect(() => {
    fetch("http://localhost:5000/api/odoo/dashboard")
      .then((res) => res.json())
      .then((data) => {
        setTotalOrders(data.totalOrders || 0);
        setQuotations(data.quotations || 0);
        setRevenue(data.totalRevenue || 0);
      })
      .catch((err) => console.log(err));
  }, []);

  useEffect(() => {
    fetch("http://localhost:5000/api/odoo/sales")
      .then((res) => res.json())
      .then((data) => {
        setOrders(data);
      })
      .catch((err) => console.log(err));
  }, []);

  useEffect(() => {
    fetch("http://localhost:5000/api/odoo/profile")
      .then((res) => res.json())
      .then((data) => {
        setUser(data);
      })
      .catch((err) => console.log(err));
  }, []);

  useEffect(() => {
  fetch("http://localhost:5000/api/odoo/monthly-sales")
    .then((res) => res.json())
    .then((data) => {
      setMonthlySales(data);
    })
    .catch((err) => console.log(err));
}, []);
useEffect(() => {
  fetch("http://localhost:5000/api/odoo/dashboard")
    .then((res) => res.json())
    .then(() => {
      setStatus("Connected");
    })
    .catch(() => {
      setStatus("Disconnected");
    });
}, []);
  return (
    <ScrollView style={styles.container}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 15,
        }}
      >
        <Text
          style={[
            styles.greeting,
            { marginLeft: 15 },
          ]}
        >
          Hello, {user.name}  👋
        </Text>
      </View>

      <Text style={styles.subTitle}>
        Here's your business overview
      </Text>

      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Revenue
          </Text>

          <Text style={styles.cardValue}>
           ₹{Number(revenue).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
})}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Orders
          </Text>

          <Text style={styles.cardValue}>
            {totalOrders}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Quotations
          </Text>

          <Text style={styles.cardValue}>
            {quotations}
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
            backgroundGradientFrom: "#ffffff",
            backgroundGradientTo: "#ffffff",
            decimalPlaces: 0,
            color: () => "#0A8F8F",
            labelColor: () => "#666",
          }}
          bezier
          style={{
            marginTop: 10,
            borderRadius: 10,
          }}
        />
      </View>

      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <Text style={styles.sectionTitle}>
            Top Sales Orders
          </Text>

          <Text style={styles.viewAll}>
            Live Data
          </Text>
        </View>

        {orders.map((item) => (
          <View
            key={item.id}
            style={styles.orderItem}
          >
            <Text>{item.name}</Text>

            <Text>
              ₹{item.amount_total}
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
    fontSize: 22,
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