declare module 'negotiator' {
  export default class Negotiator {
    constructor(request: Record<string, unknown>);
    language(available?: string[]): string | undefined;
    languages(available?: string[]): string[];
    mediaType(available?: string[]): string | undefined;
    mediaTypes(available?: string[]): string[];
    encoding(available?: string[]): string | undefined;
    encodings(available?: string[]): string[];
    charset(available?: string[]): string | undefined;
    charsets(available?: string[]): string[];
  }
}
