export type ColorValue = string;
export type SpacingValue = number | string;
export type SizeValue = number | string;

export interface StyleIntent {
  background?: ColorValue;
  textColor?: ColorValue;
  borderColor?: ColorValue;
  borderWidth?: number;
  borderRadius?: SpacingValue;
  padding?: SpacingValue;
  paddingX?: SpacingValue;
  paddingY?: SpacingValue;
  margin?: SpacingValue;
  marginX?: SpacingValue;
  marginY?: SpacingValue;
  width?: SizeValue;
  height?: SizeValue;
  minWidth?: SizeValue;
  maxWidth?: SizeValue;
  fontSize?: SpacingValue;
  fontWeight?: number | 'normal' | 'bold';
  lineHeight?: number;
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  opacity?: number;
  rawClasses?: string[];
}
