/**
 * GitLab API Documentation Configuration
 *
 * This configuration extends the default configuration with
 * GitLab-specific settings.
 */
import defaultConfig from './default.mjs';

export default defaultConfig.extend({
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

  // Processor configuration
  processors: {
    // Use GitLab-specific markdown processor
    useGitLabProcessor: true,

    // Extract metadata in a single pass
    extractMetadata: true,

    // Markdown processor configuration
    markdown: {
      // Use GitLab Flavored Markdown
      flavor: 'glfm',

      // Skip code blocks in the content for indexing
      skipCodeBlocks: true,

      // Skip HTML in the content for indexing
      skipHtml: true,

      // Set to true for debugging
      debug: false,

      // Additional options
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
    }
  }
});
