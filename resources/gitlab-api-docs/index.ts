import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ResourceCollection, createStopwordsSet, API_DOC_STOPWORDS } from './index.js';
import { registerGitLabDocCollection, runDiagnostics, runAsyncLoadBenchmark, gitlabDocsSearch } from './gitlab-docs-common.js';

/**
 * GitLab API Documentation Module
 *
 * This module registers the GitLab API documentation as a searchable resource collection.
 * It provides documentation for all GitLab REST API endpoints, making them accessible
 * through the resource system.
 */

// Create dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * GitLab API documentation collection configuration
 */
const GITLAB_API_DOCS_CONFIG = {
  id: 'gitlab-api-docs',
  name: 'GitLab API Documentation',
  description: 'Official documentation for GitLab REST API endpoints',
  dirPath: 'resources/gitlab-api-docs',
  urlBase: 'https://docs.gitlab.com/ee/api/',

  // GitLab API-specific stopwords
  stopwords: createStopwordsSet(API_DOC_STOPWORDS, [
    // Add GitLab-specific terms that should be filtered out
    'gitlab', 'repository', 'repositories', 'project', 'projects', 'branch', 'branches'
  ]),

  // Custom URL generator for GitLab API docs
  getURLForFile: (filePath: string) => {
    // Extract the filename without extension
    const fileName = path.basename(filePath, path.extname(filePath));

    // Map to the official documentation URL
    return `https://docs.gitlab.com/ee/api/${fileName}.html`;
  }
};

// Reference to the collection once registered
let GITLAB_API_DOCS: ResourceCollection | null = null;

/**
 * Register the GitLab API documentation collection with the resource system
 * This makes the documentation available for searching and browsing through the MCP server
 * @returns The registered ResourceCollection
 */
export function registerGitLabApiDocs(): ResourceCollection {
  if (!GITLAB_API_DOCS) {
    GITLAB_API_DOCS = registerGitLabDocCollection(GITLAB_API_DOCS_CONFIG);
  }
  return GITLAB_API_DOCS;
}

/**
 * Run GitLab API search with performance diagnostics
 * @param query Search query string
 * @param options Configuration options for the search
 * @returns Search results array
 */
export async function gitlabApiSearch(query: string, options = {}): Promise<any[]> {
  // Ensure collection is registered before searching
  const collection = GITLAB_API_DOCS || registerGitLabApiDocs();
  return gitlabDocsSearch(collection, query, options);
}

// Direct command-line interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  // Register the collection to ensure it's available
  const collection = registerGitLabApiDocs();

  if (args.includes('--diagnose') || args.includes('-d')) {
    runDiagnostics(collection).catch(err => {
      console.error('Error running diagnostics:', err);
      process.exit(1);
    });
  } else if (args.includes('--benchmark') || args.includes('-b')) {
    runAsyncLoadBenchmark(collection).catch(err => {
      console.error('Error running benchmark:', err);
      process.exit(1);
    });
  } else {
    console.log('Usage: node gitlab-api-docs.js [option]');
    console.log('Options:');
    console.log('  --diagnose, -d    Run diagnostic tests on the GitLab API documentation');
    console.log('  --benchmark, -b   Run performance benchmark for async resource loading and indexing');
  }
}
