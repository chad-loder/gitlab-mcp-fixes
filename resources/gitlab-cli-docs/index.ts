import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ResourceCollection, createStopwordsSet, API_DOC_STOPWORDS } from './index.js';
import { registerGitLabDocCollection, runDiagnostics, runAsyncLoadBenchmark, gitlabDocsSearch } from './gitlab-docs-common.js';

/**
 * GitLab CLI Documentation Module
 *
 * This module registers the GitLab CLI (glab) documentation as a searchable resource collection.
 * It provides documentation for all GitLab CLI commands, making them accessible
 * through the resource system.
 */

// Create dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * GitLab CLI documentation collection configuration
 */
const GITLAB_CLI_DOCS_CONFIG = {
  id: 'gitlab-cli-docs',
  name: 'GitLab CLI Documentation',
  description: 'Official documentation for GitLab CLI commands and options',
  dirPath: 'resources/gitlab-cli-docs',
  urlBase: 'https://gitlab.com/gitlab-org/cli/blob/main/docs/',

  // GitLab CLI-specific stopwords
  stopwords: createStopwordsSet(API_DOC_STOPWORDS, [
    // Add GitLab CLI-specific terms that should be filtered out
    'gitlab', 'cli', 'glab', 'command', 'option', 'flag'
  ]),

  // Custom URL generator for GitLab CLI docs
  getURLForFile: (filePath: string) => {
    // Extract the filename without extension
    const fileName = path.basename(filePath, path.extname(filePath));

    // Map to the official documentation URL
    return `https://gitlab.com/gitlab-org/cli/blob/main/docs/${fileName}.md`;
  }
};

// Reference to the collection once registered
let GITLAB_CLI_DOCS: ResourceCollection | null = null;

/**
 * Register the GitLab CLI documentation collection with the resource system
 * This makes the documentation available for searching and browsing through the MCP server
 * @returns The registered ResourceCollection
 */
export function registerGitLabCliDocs(): ResourceCollection {
  if (!GITLAB_CLI_DOCS) {
    GITLAB_CLI_DOCS = registerGitLabDocCollection(GITLAB_CLI_DOCS_CONFIG);
  }
  return GITLAB_CLI_DOCS;
}

/**
 * Run GitLab CLI search with performance diagnostics
 * @param query Search query string
 * @param options Configuration options for the search
 * @returns Search results array
 */
export async function gitlabCliSearch(query: string, options = {}): Promise<any[]> {
  // Ensure collection is registered before searching
  const collection = GITLAB_CLI_DOCS || registerGitLabCliDocs();
  return gitlabDocsSearch(collection, query, options);
}

// Direct command-line interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  // Register the collection to ensure it's available
  const collection = registerGitLabCliDocs();

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
    console.log('Usage: node gitlab-cli-docs.js [option]');
    console.log('Options:');
    console.log('  --diagnose, -d    Run diagnostic tests on the GitLab CLI documentation');
    console.log('  --benchmark, -b   Run performance benchmark for async resource loading and indexing');
  }
}
