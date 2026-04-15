declare module "ink" {
  import * as React from "react";
  import { Component, FC, ReactNode } from "react";

  export interface BoxProps {
    children?: ReactNode;
    flexDirection?: "row" | "column" | undefined;
    alignItems?: string | undefined;
    justifyContent?: string | undefined;
    flexGrow?: number | undefined;
    flexShrink?: number | undefined;
    flexBasis?: string | number | undefined;
    gap?: number | undefined;
    rowGap?: number | undefined;
    columnGap?: number | undefined;
    width?: number | string | undefined;
    height?: number | string | undefined;
    minWidth?: number | string | undefined;
    minHeight?: number | string | undefined;
    maxWidth?: number | string | undefined;
    maxHeight?: number | string | undefined;
    margin?: number | string | undefined;
    marginTop?: number | string | undefined;
    marginBottom?: number | string | undefined;
    marginLeft?: number | string | undefined;
    marginRight?: number | string | undefined;
    padding?: number | string | undefined;
    paddingTop?: number | string | undefined;
    paddingBottom?: number | string | undefined;
    paddingLeft?: number | string | undefined;
    paddingRight?: number | string | undefined;
    borderStyle?: string | undefined;
    borderColor?: string | undefined;
    borderTop?: boolean | undefined;
    borderBottom?: boolean | undefined;
    borderLeft?: boolean | undefined;
    borderRight?: boolean | undefined;
    overflow?: string | undefined;
    overflowX?: string | undefined;
    overflowY?: string | undefined;
    position?: "absolute" | "relative" | undefined;
    top?: number | string | undefined;
    bottom?: number | string | undefined;
    left?: number | string | undefined;
    right?: number | string | undefined;
    zIndex?: number | undefined;
  }

  export interface TextProps {
    children?: ReactNode;
    color?: string | undefined;
    backgroundColor?: string | undefined;
    bold?: boolean | undefined;
    dimColor?: boolean | undefined;
    italic?: boolean | undefined;
    underline?: boolean | undefined;
    strikethrough?: boolean | undefined;
    inverse?: boolean | undefined;
    wrap?: string | undefined;
  }

  export interface SpacerProps {
    width?: number | undefined;
    height?: number | undefined;
  }

  export interface useInputOptions {
    isActive?: boolean | undefined;
    handleExit?: boolean | undefined;
  }

  export type KeyEvent = {
    return: boolean;
    escape: boolean;
    space: boolean;
    backspace: boolean;
    delete: boolean;
    arrowUp: boolean;
    arrowDown: boolean;
    arrowLeft: boolean;
    arrowRight: boolean;
    ctrl: boolean;
    shift: boolean;
    meta: boolean;
  };

  export type Key = string;

  export function Box(props: BoxProps): ReactNode;
  export function Text(props: TextProps): ReactNode;
  export function Spacer(props: SpacerProps): ReactNode;
  export function useInput(
    handler: (input: string, key: KeyEvent) => void,
    options?: useInputOptions
  ): void;
  export function useStdout(): { stdout: NodeJS.WriteStream & { columns: number; rows: number; on: (event: string, cb: () => void) => void; off: (event: string, cb: () => void) => void } };
  export function render(tree: ReactNode, options?: { patchConsole?: boolean }): { unmount: () => void };
  export function measureElement(element: ReactNode): Promise<{ width: number; height: number }>;
}

declare module "gradient-string" {
  interface Gradient {
    (text: string): string;
  }
  interface GradientConfig {
    colors: string[];
  }
  function gradient(config: string[] | GradientConfig): Gradient;
  export = gradient;
}
