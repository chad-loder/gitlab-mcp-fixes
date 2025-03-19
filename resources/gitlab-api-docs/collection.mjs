/**
 * GitLab API Documentation Collection Configuration
 * Extends the default configuration with GitLab-specific settings
 */

import baseConfig from '../config/default.mjs';

/**
 * GitLab API docs collection configuration
 * Uses namespaces for clear structure and JSON serialization
 */
export default baseConfig.extend({
  // Update core metadata
  metadata: {
    id: "gitlab-api-docs",
    name: "GitLab API Documentation",
    description: "Official documentation for GitLab REST API endpoints"
  },

  // Content selection configuration
  content: {
    // Content directory is now in a subdirectory
    contentRoot: "content",

    // Add GitLab-specific exclusions
    excludes: [
      // Exclude large reference files that skew search results
      "**/graphql/reference/_index.md",
      "**/rest/openapi_spec.md",
      "**/rest/_index.md"
    ]
  },

  // Search configuration
  search: {
    // Update boost values for GitLab docs
    boost: {
      title: 15,         // Increase title boost even more for GitLab docs
      parameterData: 5,  // Parameter data is more important in API docs
      content: 1
    },

    // Change search options
    options: {
      combineWith: "AND"  // Use AND for more precise matching in API docs
    },

    // Term processing
    termProcessing: {
      // Add GitLab-specific stopwords
      stopwords: {
        // Add product-specific terms
        product: [
          "gitlab", "repository", "repositories", "project", "projects",
          "branch", "branches", "merge", "request", "requests",
          "commit", "commits", "issue", "issues", "group", "groups",
          "user", "users", "pipeline", "pipelines"
        ]
      }
    }
  },

  // Custom functions for this collection
  functions: {
    /**
     * Generates a URL for the official GitLab documentation
     *
     * @param {string} filePath - Path to the local documentation file
     * @returns {string} URL to the corresponding official documentation
     */
    getUrlForFile(filePath) {
      // Extract the filename without extension, respecting the content subdirectory
      const fileName = filePath.split('/').pop().replace(/\.[^.]+$/, '');

      // Map to the official documentation URL
      return `https://docs.gitlab.com/ee/api/${fileName}.html`;
    }
  },

  /**
   * Override to include product-specific stopwords
   */
  getAllStopwords() {
    const commonStopwords = baseConfig.getAllStopwords();
    const productStopwords = this.search.termProcessing.stopwords.product || [];

    return new Set([
      ...Array.from(commonStopwords),
      ...productStopwords
    ]);
  }
});
