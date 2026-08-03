import { TextStyle, Platform } from "react-native";

/** Linked via assets/fonts + react-native.config.js */
export const fonts = {
  sans: "Manrope",
  display: "Fraunces",
};

export const type = {
  display: {
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: "600" as TextStyle["fontWeight"],
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    fontWeight: "600" as TextStyle["fontWeight"],
    letterSpacing: -0.3,
    lineHeight: 32,
  },
  headline: {
    fontFamily: fonts.sans,
    fontSize: 18,
    fontWeight: "700" as TextStyle["fontWeight"],
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: "400" as TextStyle["fontWeight"],
    lineHeight: 22,
  },
  bodyMedium: {
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: "600" as TextStyle["fontWeight"],
    lineHeight: 22,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: "600" as TextStyle["fontWeight"],
    letterSpacing: 0.4,
    textTransform: "uppercase" as TextStyle["textTransform"],
    lineHeight: 16,
  },
  caption: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: "400" as TextStyle["fontWeight"],
    lineHeight: 18,
  },
  metric: {
    fontFamily: fonts.sans,
    fontSize: 20,
    fontWeight: "600" as TextStyle["fontWeight"],
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  heroValue: {
    fontFamily: fonts.display,
    fontSize: 40,
    fontWeight: "600" as TextStyle["fontWeight"],
    letterSpacing: -1,
    lineHeight: 46,
  },
  tab: {
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: "600" as TextStyle["fontWeight"],
    letterSpacing: 0.2,
  },
};

/** Android sometimes needs the file-stem family name for variable fonts. */
export const fontFamily = {
  sans: Platform.select({ ios: fonts.sans, android: fonts.sans, default: fonts.sans })!,
  display: Platform.select({
    ios: fonts.display,
    android: fonts.display,
    default: fonts.display,
  })!,
};
