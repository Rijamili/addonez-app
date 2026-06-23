import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from "react-native";

export default function FinanceScreen() {
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/api/odoo/finance")
      .then((res) => res.json())
      .then((data) => {
        setInvoices(data);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  const totalInvoices = invoices.length;

  const paidInvoices = invoices.filter(
    (item) => item.payment_state === "paid"
  ).length;

  const pendingInvoices = invoices.filter(
    (item) => item.payment_state !== "paid"
  ).length;

  const totalAmount = invoices.reduce(
    (sum, item) => sum + Number(item.amount_total || 0),
    0
  );
  const paidAmount = invoices
  .filter((item) => item.payment_state === "paid")
  .reduce(
    (sum, item) => sum + Number(item.amount_total || 0),
    0
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>
        Finance Overview
      </Text>

      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.label}>
            Total Invoices
          </Text>
          <Text style={styles.count}>
            {totalInvoices}
          </Text>
          <Text style={styles.amount}>
            ₹{totalAmount.toFixed(2)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            Paid Invoices
          </Text>
          <Text style={styles.count}>
            {paidInvoices}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.label}>
            Pending Invoices
          </Text>
          <Text style={styles.count}>
            {pendingInvoices}
          </Text>
        </View>

        <View style={styles.card}>
         <Text style={styles.label}>
  Paid Amount
</Text>

<Text style={styles.amount}>
  ₹{paidAmount.toFixed(2)}
</Text>
        </View>
      </View>

      <View style={styles.invoiceSection}>
        <Text style={styles.sectionTitle}>
          Recent Invoices
        </Text>

        {invoices.map((item, index) => (
          <View
            key={index}
            style={styles.invoiceItem}
          >
            <View>
              <Text style={styles.invoiceNo}>
  {item.name === "/" ? "Draft Invoice" : item.name}
</Text>
            </View>

            <View>
              <Text>
                ₹{item.amount_total}
              </Text>

              <Text
                style={
                  item.payment_state === "paid"
                    ? styles.paid
                    : styles.pending
                }
              >
                {item.payment_state === "paid"
  ? "Paid"
  : "Pending"}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FB",
    padding: 15,
   
    alignSelf: "center",
    width: "100%",
  },

  header: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 20,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  card: {
    backgroundColor: "#fff",
    width: "48%",
    padding: 15,
    borderRadius: 12,
  },

  label: {
    color: "#666",
    fontSize: 12,
  },

  count: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 5,
  },

  amount: {
    marginTop: 5,
    fontWeight: "bold",
  },

  invoiceSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginTop: 10,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },

  invoiceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },

  invoiceNo: {
    fontWeight: "bold",
  },

  paid: {
    color: "green",
  },

  pending: {
    color: "orange",
  },
});