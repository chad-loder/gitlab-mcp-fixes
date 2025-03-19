/**
 * Default collection configuration
 * This is the base configuration that all collections inherit from
 */

/**
 * Default configuration for all collections
 * Organized with clear namespaces for better JSON serialization and understanding
 */
export default {
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
   * @param {Object} overrides - Configuration overrides
   * @returns {Object} New configuration with overrides applied
   */
  extend(overrides = {}) {
    // Helper function for deep merge
    const deepMerge = (target, source) => {
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
    function isObject(item) {
      return (item && typeof item === 'object' && !Array.isArray(item));
    }

    // Perform the deep merge
    return deepMerge(this, overrides);
  },

  /**
   * Returns all stopwords from this configuration
   *
   * @returns {Set<string>} Set of all stopwords
   */
  getAllStopwords() {
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
   * @param {string} collectionPath - Base path of the collection
   * @returns {string} Full path to the content directory
   */
  getContentPath(collectionPath) {
    return this.content.contentRoot
      ? `${collectionPath}/${this.content.contentRoot}`
      : collectionPath;
  },

  /**
   * Converts configuration to a JSON-compatible format
   * Removes functions and converts Sets to arrays
   *
   * @returns {Object} JSON-compatible configuration object
   */
  toJSON() {
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
