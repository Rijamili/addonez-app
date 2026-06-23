import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";
import SplashScreen from "../screens/SplashScreen";
import LoginScreen from "../screens/LoginScreen";
import DrawerMenu from "./DrawerMenu";
const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>

        <Stack.Screen
          name="Splash"
          component={SplashScreen}
        />

        <Stack.Screen
          name="Login"
          component={LoginScreen}
        />

        <Stack.Screen
  name="ForgotPassword"
  component={ForgotPasswordScreen}
/>

       <Stack.Screen
  name="Home"
  component={DrawerMenu}
  options={{ gestureEnabled: false }}
/>

      </Stack.Navigator>
    </NavigationContainer>
  );
}