/// <reference types="vite/client" />

declare const __APP_DISPLAY_NAME__: string;

declare module '*.png' {
  const src: string;
  export default src;
}
