import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps, type TextStyle } from 'react-native';
import {
  useFonts,
  Roboto_300Light,
  Roboto_400Regular,
  Roboto_600SemiBold,
  Roboto_700Bold,
  Roboto_800ExtraBold,
  Roboto_900Black,
} from '@expo-google-fonts/roboto';

const fonts = { Roboto_300Light, Roboto_400Regular, Roboto_600SemiBold, Roboto_700Bold, Roboto_800ExtraBold, Roboto_900Black };

export function useAppFonts() {
  return useFonts(fonts);
}

function fontStyle(style: TextProps['style']): TextStyle {
  const weight = StyleSheet.flatten(style)?.fontWeight;
  const family = weight === '300' ? 'Roboto_300Light'
    : weight === '600' ? 'Roboto_600SemiBold'
    : weight === '700' || weight === 'bold' ? 'Roboto_700Bold'
    : weight === '800' ? 'Roboto_800ExtraBold'
    : weight === '900' ? 'Roboto_900Black' : 'Roboto_400Regular';
  return { fontFamily: family, fontWeight: 'normal' };
}

export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[style, fontStyle(style)]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <NativeTextInput {...props} style={[style, fontStyle(style)]} />;
}
