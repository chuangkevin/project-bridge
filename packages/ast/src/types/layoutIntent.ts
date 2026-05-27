export type LayoutKind = 'stack' | 'grid' | 'flow' | 'absolute';
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch';
export type LayoutJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

export interface StackLayout {
  kind: 'stack';
  direction: 'vertical' | 'horizontal';
  gap?: number;
  align?: LayoutAlign;
  justify?: LayoutJustify;
  wrap?: boolean;
}
export interface GridLayout {
  kind: 'grid';
  columns: number | string;
  rows?: number | string;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
}
export interface FlowLayout { kind: 'flow'; }
export interface AbsoluteLayout {
  kind: 'absolute';
  x?: number; y?: number; width?: number; height?: number;
}
export type LayoutIntent = StackLayout | GridLayout | FlowLayout | AbsoluteLayout;
