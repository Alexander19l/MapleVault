declare module 'unzipper' {
  interface Entry {
    path: string;
    type: string;
    buffer(): Promise<Buffer>;
  }

  interface Directory {
    files: Entry[];
  }

  export function OpenBuffer(data: Buffer): Promise<Directory>;
  export const Open: { buffer(data: Buffer): Promise<Directory> };
  const unzipper: { Open: { buffer(data: Buffer): Promise<Directory> } };
  export default unzipper;
}
