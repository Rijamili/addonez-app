import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from "react-native";

import { LineChart } from "react-native-chart-kit";
import { Dimensions } from "react-native";

const screenWidth = Dimensions.get("window").width;

export default function SalesScreen() {
  const [orders, setOrders] = useState([]);
const [monthlySales, setMonthlySales] = useState([]);
  

 useEffect(() => {
  fetch("http://localhost:5000/api/odoo/sales")
    .then((res) => res.json())
    .then((data) => {
      setOrders(data);
    })
    .catch((err) => console.log(err));

  fetch("http://localhost:5000/api/odoo/monthly-sales")
    .then((res) => res.json())
    .then((data) => {
      setMonthlySales(data);
    })
    .catch((err) => console.log(err));
}, []);

  const totalSales = orders.reduce(
    (sum, item) => sum + Number(item.amount_total),
    0
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>
        Sales Overview
      </Text>
   

      {/* Total Sales Card */}
      <View style={styles.salesCard}>
        <Text style={styles.salesLabel}>
          Total Sales
        </Text>

        <Text style={styles.salesAmount}>
          ₹{totalSales.toFixed(2)}
        </Text>

        <Text style={styles.growth}>
          ↑ Live Data From Odoo
        </Text>
      </View>

      {/* Sales Trend */}
      <View style={styles.chartContainer}>
        <Text style={styles.sectionTitle}>
          Sales Trend
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
          width={screenWidth - 40}
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
            borderRadius: 12,
            marginTop: 10,
          }}
        />
      </View>

      {/* Top Orders */}
      <View style={styles.ordersSection}>
        <Text style={styles.sectionTitle}>
          Top Sales Orders
        </Text>

        {orders.map((item) => (
          <View
            key={item.id}
            style={styles.orderCard}
          >
            <View>
              <Text style={styles.orderName}>
                {item.name}
              </Text>

              <Text style={styles.orderStatus}>
                {item.state}
              </Text>
            </View>

            <Text style={styles.orderAmount}>
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
 
  alignSelf: "center",
  width: "100%",
},

  header: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
  },

  salesCard: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
  },

  salesLabel: {
    color: "#666",
    fontSize: 16,
  },

  salesAmount: {
    fontSize: 36,
    fontWeight: "bold",
    marginTop: 10,
  },

  growth: {
    color: "green",
    marginTop: 10,
  },

  chartContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 15,
    marginBottom: 20,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },

  ordersSection: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 15,
    marginBottom: 30,
  },

  orderCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },

  orderName: {
    fontSize: 18,
    fontWeight: "bold",
  },

  orderStatus: {
    color: "#666",
    marginTop: 4,
  },

  orderAmount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0A8F8F",
  },
 
});