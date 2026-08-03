export const PERMISSIONS = { IOS: { MICROPHONE: "ios.permission.MICROPHONE" } };
export const RESULTS = { GRANTED: "granted", DENIED: "denied" };
export async function check() {
  return RESULTS.DENIED;
}
export async function request() {
  return RESULTS.DENIED;
}
