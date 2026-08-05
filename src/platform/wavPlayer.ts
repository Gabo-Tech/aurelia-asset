import { NativeModules, Platform } from "react-native";

type WavPlayerNative = {
  play: (path: string) => Promise<boolean>;
  stop: () => Promise<void>;
};

const native = NativeModules.WavPlayer as WavPlayerNative | undefined;

export async function playWavFile(path: string): Promise<boolean> {
  if (Platform.OS !== "android" || !native?.play) return false;
  await native.play(path);
  return true;
}

export async function stopWavPlayback(): Promise<void> {
  if (Platform.OS !== "android" || !native?.stop) return;
  await native.stop();
}
