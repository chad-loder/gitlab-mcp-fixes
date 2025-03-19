/**
 * GitLab API Documentation Configuration
 *
 * This configuration extends the default configuration with
 * GitLab-specific settings.
 */
import defaultConfig, { CollectionConfig } from './default.js';

/**
 * GitLab API documentation collection configuration
 */
const gitlabApiDocsConfig: CollectionConfig = defaultConfig.extend({
  // Core collection metadata
  metadata: {
    id: "gitlab-api-docs",
    name: "GitLab API Documentation",
    description: "Official documentation for GitLab REST API endpoints"
  },

  // Content filtering and selection
  content: {
    // Root directory for content, relative to the collection root
    contentRoot: "content",

    // File patterns for inclusion
    includes: [
      "**/*.md",   // Include all markdown files
      "**/*.mdx"   // Include MDX files
    ],

    // File patterns for exclusion
    excludes: [
      "**/node_modules/**",  // Exclude node_modules
      "**/.git/**",          // Exclude .git
      "**/README.md",        // Exclude README files
      "**/_*.md",            // Exclude files starting with underscore
      "**/LICENSE*.md",      // Exclude license files
      "**/CHANGELOG*.md"     // Exclude changelog files
    ]
  },

  // Processor configuration - updated to use declarative config
  processors: {
    // Configuration for the processor registry
    registry: {
      // Map file patterns to specific processor types
      patterns: {
        "**/*.md": "gitlabMarkdown",
        "**/*.markdown": "gitlabMarkdown",
        "**/*.mdx": "gitlabMarkdown"
      }
    },

    // Base configuration applied to all processors
    base: {
      debug: false
    },

    // GitLab-specific markdown processor configuration
    gitlabMarkdown: {
      type: "gitlabMarkdown",
      extractMetadata: true,
      skipCodeBlocks: true,
      skipHtml: true,
      flavor: "glfm",
      options: {
        breaks: false,
        pedantic: false,
        allowHtml: true
      }
    }
  },

  // Search behavior configuration
  search: {
    // Field boosting configuration
    boost: {
      title: 15,         // Title is most important
      parameterData: 5,  // Parameter data is moderately important
      content: 1         // Content has standard weight
    },

    // General search options
    options: {
      fuzzy: 0.2,        // Allow for minor typos and variations
      prefix: true,      // Match on prefixes
      combineWith: "AND" // Require all terms to match
    },

    // Term processing (inherits from default config)
    termProcessing: {
      // Modified stopwords for GitLab API docs
      stopwords: {
        common: [
          "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in",
          "into", "is", "it", "no", "not", "of", "on", "or", "such", "that", "the",
          "their", "then", "there", "these", "they", "this", "to", "was", "will", "with",
          "when", "else", "how", "what", "where", "who", "why"
        ],
        domain: [
          "api", "parameter", "parameters", "example", "examples", "response",
          "request", "endpoint", "field", "value", "true", "false", "null", "object",
          "gitlab", "project", "projects", "issue", "issues", "merge", "request", "requests"
        ],
        highFrequency: [
          "see", "https", "com", "stage", "info", "determine", "technical", "writer",
          "assigned", "associated", "page", "handbook", "product", "writing", "title",
          "details", "optional", "required", "returns", "default"
        ]
      },
      // Use default stemming settings
      stemming: {
        enabled: true,
        handlePlurals: true,
        handleVerbForms: true,
        handleCommonSuffixes: true
      }
    }
  }
});

export default gitlabApiDocsConfig;
