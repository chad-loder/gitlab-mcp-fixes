/**
 * TypeScript declarations for MJS config files
 */

declare module '*.mjs' {
  /**
   * Configuration object with collection settings
   */
  const config: {
    metadata: {
      id: string;
      name: string;
      description: string;
    };

    content: {
      contentRoot: string;
      includes: string[];
      excludes: string[];
    };

    processors?: {
      markdown?: {
        flavor?: 'gfm' | 'glfm';
        skipCodeBlocks?: boolean;
        skipHtml?: boolean;
        debug?: boolean;
        options?: {
          breaks?: boolean;
          pedantic?: boolean;
          allowHtml?: boolean;
          markedOptions?: any;
        };
      };
    };

    search: {
      boost: {
        title: number;
        parameterData: number;
        content: number;
      };
      options: {
        fuzzy: number;
        prefix: boolean;
        combineWith: 'AND' | 'OR';
      };
      termProcessing: {
        stopwords: {
          common: string[];
          domain: string[];
          highFrequency: string[];
        };
        stemming: {
          enabled: boolean;
          handlePlurals: boolean;
          handleVerbForms: boolean;
          handleCommonSuffixes: boolean;
        };
      };
    };

    extend: (overrides?: any) => any;
    getAllStopwords: () => Set<string>;
    getContentPath: (collectionPath: string) => string;
    toJSON: () => any;
  };

  export default config;
}
