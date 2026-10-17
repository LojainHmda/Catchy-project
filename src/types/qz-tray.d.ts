// qz-tray ships no TypeScript types. This declares only the small slice of its
// API that src/lib/qz/qzPrint.ts actually uses.
declare module 'qz-tray' {
  interface QzPrintConfig {
    [key: string]: unknown;
  }

  interface QzPrintData {
    type: 'raw' | 'html' | 'pdf' | 'image';
    format?: string;
    data: string;
  }

  const qz: {
    security: {
      setCertificatePromise(fn: (resolve: (cert: string) => void, reject: (err: unknown) => void) => void): void;
      setSignatureAlgorithm(algorithm: string): void;
      setSignaturePromise(
        fn: (toSign: string) => (resolve: (sig: string) => void, reject: (err: unknown) => void) => void
      ): void;
    };
    websocket: {
      connect(options?: { retries?: number; delay?: number }): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
    };
    printers: {
      find(name?: string): Promise<string | string[]>;
      getDefault(): Promise<string>;
    };
    configs: {
      create(printer: string | null, options?: Record<string, unknown>): QzPrintConfig;
    };
    print(config: QzPrintConfig, data: QzPrintData[]): Promise<void>;
  };

  export default qz;
}
