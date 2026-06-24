import api from "../services/api";
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
    api.get("/odoo/finance")
      .then((res) => setInvoices(res.data))
      .catch((err) => console.log(err));
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
    .reduce((sum, item) => sum + Number(item.amount_total || 0), 0);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Finance Overview</Text>

      {invoices.length === 0 ? (
        <Text style={styles.loadingText}>Loading finance data...</Text>
      ) : (
        <>
          <View style={styles.row}>
            <View style={styles.card}>
              <Text style={styles.label}>Total Invoices</Text>
              <Text style={styles.count}>{totalInvoices}</Text>
              <Text style={styles.amount}>₹{totalAmount.toFixed(2)}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Paid Invoices</Text>
              <Text style={styles.count}>{paidInvoices}</Text>
              <Text style={styles.amount}>₹{paidAmount.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.card}>
              <Text style={styles.label}>Pending Invoices</Text>
              <Text style={styles.count}>{pendingInvoices}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Paid Amount</Text>
              <Text style={styles.amount}>₹{paidAmount.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.invoiceSection}>
            <Text style={styles.sectionTitle}>Recent Invoices</Text>

            {invoices.map((item, index) => (
              <View key={index} style={styles.invoiceItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoiceNo}>
                    {item.name === "/" ? "Draft Invoice" : item.name}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.invoiceAmount}>
                    ₹{Number(item.amount_total).toFixed(2)}
                  </Text>
                  <Text
                    style={
                      item.payment_state === "paid"
                        ? styles.paid
                        : styles.pending
                    }
                  >
                    {item.payment_state === "paid" ? "Paid" : "Pending"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FB",
    padding: 15,
    width: "100%",
  },
  header: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 20,
  },
  loadingText: {
    textAlign: "center",
    color: "#999",
    marginTop: 40,
    fontSize: 16,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    color: "#0A8F8F",
  },
  invoiceSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginTop: 10,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  invoiceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  invoiceNo: {
    fontWeight: "bold",
    fontSize: 15,
  },
  invoiceAmount: {
    fontWeight: "bold",
    fontSize: 15,
  },
  paid: {
    color: "green",
    marginTop: 4,
  },
  pending: {
    color: "orange",
    marginTop: 4,
  },
});