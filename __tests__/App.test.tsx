/**
 * @format
 */

import React from "react";
import ReactTestRenderer from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  return {
    GestureHandlerRootView: View,
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    PanGestureHandler: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    Directions: {},
  };
});

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    SafeAreaProvider: View,
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock("@/i18n", () => ({}));

jest.mock("@/navigation/RootNavigator", () => {
  const { Text } = require("react-native");
  return {
    RootNavigator: () => <Text>RootNavigator</Text>,
  };
});

jest.mock("@/lib/store", () => ({
  useHydrateStore: () => true,
}));

jest.mock("@/lib/finance/cache", () => ({
  hydrateQuoteCache: async () => undefined,
}));

import App from "../App";

test("renders native navigator when hydrated", async () => {
  let tree: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  expect(tree!.root.findByProps({ children: "RootNavigator" })).toBeTruthy();
});
