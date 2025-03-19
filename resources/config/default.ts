/**
 * Default collection configuration
 * This is the base configuration that all collections inherit from
 */
import { ProcessorConfigSet } from '../processors/config.js';

/**
 * Interface for collection stopwords configuration
 */
export interface StopwordsConfig {
  common: string[];
  domain: string[];
  highFrequency: string[];
}

/**
 * Interface for stemming configuration
 */
export interface StemmingConfig {
  enabled: boolean;
  handlePlurals: boolean;
  handleVerbForms: boolean;
  handleCommonSuffixes: boolean;
}

/**
 * Interface for search boost configuration
 */
export interface SearchBoostConfig {
  [field: string]: number;
}

/**
 * Interface for search options
 */
export interface SearchOptionsConfig {
  fuzzy: number;
  prefix: boolean;
  combineWith: 'AND' | 'OR';
}

/**
 * Interface for term processing configuration
 */
export interface TermProcessingConfig {
  stopwords: StopwordsConfig;
  stemming: StemmingConfig;
}

/**
 * Interface for search configuration
 */
export interface SearchConfig {
  boost: SearchBoostConfig;
  options: SearchOptionsConfig;
  termProcessing: TermProcessingConfig;
}

/**
 * Interface for content configuration
 */
export interface ContentConfig {
  contentRoot: string;
  includes: string[];
  excludes: string[];
}

/**
 * Interface for collection metadata
 */
export interface CollectionMetadata {
  id: string;
  name: string;
  description: string;
}

/**
 * Interface for the complete collection configuration
 */
export interface CollectionConfig {
  metadata: CollectionMetadata;
  content: ContentConfig;
  processors: ProcessorConfigSet;
  search: SearchConfig;
  extend: (overrides: Partial<CollectionConfig>) => CollectionConfig;
  getAllStopwords: () => Set<string>;
  getContentPath: (collectionPath: string) => string;
  toJSON: () => any;
}

/**
 * Default configuration for all collections
 * Organized with clear namespaces for better JSON serialization and understanding
 */
const defaultConfig: CollectionConfig = {
  // Core collection metadata
  metadata: {
    id: "default",
    name: "Default Collection",
    description: "Base configuration for all collections"
  },

  // Content filtering and selection
  content: {
    // Root directory for content, relative to the collection root
    contentRoot: "",  // Default is collection root

    // File patterns for inclusion
    includes: [
      "**/*.md",   // Include all markdown files
      "**/*.mdx"   // Include MDX files
    ],

    // File patterns for exclusion
    excludes: [
      "**/node_modules/**",  // Exclude node_modules
      "**/.git/**",          // Exclude .git
      "**/README.md",        // Exclude README files by default
      "**/_*.md",            // Exclude files starting with underscore
      "**/LICENSE*.md",      // Exclude license files
      "**/CHANGELOG*.md"     // Exclude changelog files
    ]
  },

  // Processor configuration
  processors: {
    // Base configuration applied to all processors
    base: {
      debug: false
    },

    // Registry configuration
    registry: {
      defaultProcessor: "plaintext",
      patterns: {
        "**/*.md": "markdown",
        "**/*.markdown": "markdown",
        "**/*.mdx": "markdown",
        "**/*.txt": "plaintext",
        "**/*.text": "plaintext"
      }
    },

    // Plaintext processor configuration
    plaintext: {
      type: "plaintext"
    },

    // Markdown processor configuration
    markdown: {
      type: "markdown",
      // Whether to skip code blocks in the content for indexing
      skipCodeBlocks: true,

      // Whether to skip HTML in the content for indexing
      skipHtml: true,

      // Whether to extract metadata during processing
      extractMetadata: true,

      // Flavor of markdown to parse
      // - 'gfm': GitHub Flavored Markdown (default)
      // - 'glfm': GitLab Flavored Markdown
      flavor: 'gfm',

      // Additional marked.js options
      options: {
        breaks: false,       // Don't treat line breaks as <br>
        pedantic: false,     // Don't use pedantic GFM
        allowHtml: true      // Allow HTML in markdown
      }
    }
  },

  // Search behavior configuration
  search: {
    // Field boosting configuration
    boost: {
      title: 12,         // Title is most important
      parameterData: 3,  // Parameter data is moderately important
      content: 1         // Content has standard weight
    },

    // General search options
    options: {
      fuzzy: 0.2,        // Allow for minor typos and variations
      prefix: true,      // Match on prefixes
      combineWith: "OR"  // Match any of the search terms
    },

    // Term processing
    termProcessing: {
      // Stopwords configuration
      stopwords: {
        // Common English stopwords
        common: [
          "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in",
          "into", "is", "it", "no", "not", "of", "on", "or", "such", "that", "the",
          "their", "then", "there", "these", "they", "this", "to", "was", "will", "with",
          "when", "else", "how", "what", "where", "who", "why"
        ],

        // Domain-specific terms
        domain: [
          "api", "parameter", "parameters", "example", "examples", "response",
          "request", "endpoint", "field", "value", "true", "false", "null", "object"
        ],

        // High frequency terms identified through diagnostics
        highFrequency: [
          "see", "https", "com", "stage", "info", "determine", "technical", "writer",
          "assigned", "associated", "page", "handbook", "product", "writing", "title",
          "details"
        ]
      },

      // Stemming configuration
      stemming: {
        enabled: true,             // Enable stemming by default
        handlePlurals: true,       // Handle plural forms
        handleVerbForms: true,     // Handle verb conjugations
        handleCommonSuffixes: true // Handle common suffixes
      }
    }
  },

  // Extension mechanism
  /**
   * Extends this configuration with overrides
   *
   * @param overrides - Configuration overrides
   * @returns New configuration with overrides applied
   */
  extend(overrides: Partial<CollectionConfig> = {}): CollectionConfig {
    // Helper function for deep merge
    const deepMerge = (target: any, source: any): any => {
      const output = { ...target };

      if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
          if (isObject(source[key])) {
            if (!(key in target)) {
              Object.assign(output, { [key]: source[key] });
            } else {
              output[key] = deepMerge(target[key], source[key]);
            }
          } else if (Array.isArray(source[key])) {
            // For arrays, we either replace or concatenate based on the key
            if (key === 'excludes' || key === 'includes' || key.endsWith('List')) {
              // Concatenate arrays for these keys
              output[key] = [...(target[key] || []), ...source[key]];
            } else {
              // Replace arrays for other keys
              output[key] = [...source[key]];
            }
          } else {
            Object.assign(output, { [key]: source[key] });
          }
        });
      }

      return output;
    };

    // Helper function to check if a value is an object
    function isObject(item: any): boolean {
      return (item && typeof item === 'object' && !Array.isArray(item));
    }

    // Process legacy format for backward compatibility
    const processedOverrides = { ...overrides } as any;

    // Handle legacy GitLab processor configuration
    if (overrides.processors && (overrides.processors as any).useGitLabProcessor === true) {
      // Create gitlabMarkdown config from legacy format
      processedOverrides.processors = {
        ...processedOverrides.processors,
        gitlabMarkdown: {
          type: "gitlabMarkdown",
          extractMetadata: (processedOverrides.processors as any).extractMetadata !== undefined
            ? (processedOverrides.processors as any).extractMetadata
            : true,
          skipCodeBlocks: (processedOverrides.processors as any).markdown?.skipCodeBlocks,
          skipHtml: (processedOverrides.processors as any).markdown?.skipHtml,
          flavor: 'glfm',
          options: (processedOverrides.processors as any).markdown?.options
        },
        // Update registry patterns to use GitLab processor
        registry: {
          patterns: {
            "**/*.md": "gitlabMarkdown",
            "**/*.markdown": "gitlabMarkdown",
            "**/*.mdx": "gitlabMarkdown"
          }
        }
      };

      // Remove legacy properties
      delete (processedOverrides.processors as any).useGitLabProcessor;
      delete (processedOverrides.processors as any).extractMetadata;
    }

    // Handle legacy markdown configuration
    if (overrides.processors && (overrides.processors as any).markdown &&
        !(overrides.processors as any).markdown.type) {
      // Move legacy markdown config to proper structure
      processedOverrides.processors = {
        ...processedOverrides.processors,
        markdown: {
          type: "markdown",
          ...(processedOverrides.processors as any).markdown,
          extractMetadata: true
        }
      };
    }

    // Perform the deep merge
    return deepMerge(this, processedOverrides);
  },

  /**
   * Returns all stopwords from this configuration
   *
   * @returns Set of all stopwords
   */
  getAllStopwords(): Set<string> {
    const stopwordsConfig = this.search.termProcessing.stopwords;
    return new Set([
      ...stopwordsConfig.common,
      ...stopwordsConfig.domain,
      ...stopwordsConfig.highFrequency
    ]);
  },

  /**
   * Get the full path to the content directory
   *
   * @param collectionPath - Base path of the collection
   * @returns Full path to the content directory
   */
  getContentPath(collectionPath: string): string {
    return this.content.contentRoot
      ? `${collectionPath}/${this.content.contentRoot}`
      : collectionPath;
  },

  /**
   * Converts configuration to a JSON-compatible format
   * Removes functions and converts Sets to arrays
   *
   * @returns JSON-compatible configuration object
   */
  toJSON(): any {
    const clone = JSON.parse(JSON.stringify(this, (key, value) => {
      // Skip functions in JSON serialization
      if (typeof value === 'function') {
        return undefined;
      }
      // Convert Sets to arrays
      if (value instanceof Set) {
        return Array.from(value);
      }
      return value;
    }));

    return clone;
  }
};

export default defaultConfig;
