import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import DashboardScreen from "../screens/DashboardScreen";
import SalesScreen from "../screens/SalesScreen";
import ProjectsScreen from "../screens/ProjectsScreen";
import FinanceScreen from "../screens/FinanceScreen";
import AnalyticsScreen from "../screens/AnalyticsScreen";
import PredictionsScreen from "../screens/PredictionsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import AIInsightsScreen from "../screens/AIInsightsScreen";

const Tab = createBottomTabNavigator();

export default function BottomTabs() {
  return (
    <Tab.Navigator>

      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
      />

      <Tab.Screen
        name="Sales"
        component={SalesScreen}
      />

      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
      />

      <Tab.Screen
        name="Finance"
        component={FinanceScreen}
      />

      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
      />

      <Tab.Screen
        name="Predictions"
        component={PredictionsScreen}
      />
       

        <Tab.Screen
  name="AI Insights"
  component={AIInsightsScreen}
/>
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
      />

     

    </Tab.Navigator>
  );
}