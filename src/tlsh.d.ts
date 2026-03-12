declare module 'tlsh' {
  function hash(data: string): string;
  export default hash;
}

declare module 'tlsh/lib/digests/digest-hash-builder.js' {
  export default function DigestHashBuilder(): {
    withHash: (hash: string) => {
      build: () => {
        calculateDifference: (other: any, normalize?: boolean) => number;
      };
    };
  };
}
