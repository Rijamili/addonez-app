import React from "react";
import { createDrawerNavigator } from "@react-navigation/drawer";

import DashboardScreen from "../screens/DashboardScreen";
import SalesScreen from "../screens/SalesScreen";
import ProjectsScreen from "../screens/ProjectsScreen";
import FinanceScreen from "../screens/FinanceScreen";
import AnalyticsScreen from "../screens/AnalyticsScreen";
import PredictionsScreen from "../screens/PredictionsScreen";
import AIInsightsScreen from "../screens/AIInsightsScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Drawer = createDrawerNavigator();

export default function DrawerMenu() {
  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: true,
      }}
    >
      <Drawer.Screen name="Dashboard" component={DashboardScreen} />
      <Drawer.Screen name="Sales" component={SalesScreen} />
      <Drawer.Screen name="Projects" component={ProjectsScreen} />
      <Drawer.Screen name="Finance" component={FinanceScreen} />
      <Drawer.Screen name="Analytics" component={AnalyticsScreen} />
      <Drawer.Screen name="Predictions" component={PredictionsScreen} />
      <Drawer.Screen name="AI Insights" component={AIInsightsScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
    </Drawer.Navigator>
  );
}