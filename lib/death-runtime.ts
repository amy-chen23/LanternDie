// Web and Expo Go keep the community path available without a native runtime.
export function canScoreLocally() { return false; }
export async function scoreLanternflies(_photo: Uint8Array, _width: number, _height: number,
  _boxes: import('./death-policy').Box[]): Promise<number[]> {
  throw new Error('native_build_required');
}
