declare module 'jszip' {
  export default class JSZip {
    static loadAsync(data: ArrayBuffer | Blob): Promise<JSZip>
    files: Record<string, { name: string }>
    file(name: string): { async(type: 'string'): Promise<string> } | null
    file(name: string, data: string): JSZip
    generateAsync(options: { type: 'arraybuffer' }): Promise<ArrayBuffer>
  }
}
