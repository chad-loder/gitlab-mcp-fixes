import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ResourceCollection, registerCollection, loadResourcesFromCollection, getSearchIndexForCollection } from './index.js';
import * as fs from 'fs';
import MiniSearch from 'minisearch';

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
 * Defines the metadata and location of the GitLab API documentation resources
 */
const GITLAB_API_DOCS: ResourceCollection = {
  id: 'gitlab-api-docs',
  name: 'GitLab API Documentation',
  description: 'Official documentation for GitLab REST API endpoints',
  dirPath: path.join(__dirname, 'gitlab-api-docs'),

  /**
   * Maps a local file path to its corresponding official GitLab documentation URL
   *
   * @param {string} filePath - Path to the local documentation file
   * @returns {string} URL to the corresponding official documentation page
   */
  getURLForFile: (filePath: string) => {
    // Extract the filename without extension
    const fileName = path.basename(filePath, path.extname(filePath));

    // Map to the official documentation URL
    return `https://docs.gitlab.com/ee/api/${fileName}.html`;
  }
};

/**
 * Register the GitLab API documentation collection with the resource system
 * This makes the documentation available for searching and browsing through the MCP server
 */
export function registerGitLabApiDocs(): void {
  registerCollection(GITLAB_API_DOCS);
}

/**
 * Run diagnostic tests on the GitLab API documentation
 * Measures performance and displays detailed information about the indexing and search process
 *
 * @returns {Promise<void>} Promise that resolves when diagnostics are complete
 */
async function runDiagnostics(): Promise<void> {
  console.log('==== GitLab API Documentation Diagnostics ====\n');

  // Time the loading of resources
  console.log('Loading GitLab API documentation resources...');
  const loadStartTime = performance.now();
  const resources = await loadResourcesFromCollection(GITLAB_API_DOCS);
  const loadEndTime = performance.now();
  const loadDuration = loadEndTime - loadStartTime;

  console.log(`Loaded ${resources.length} documentation files in ${loadDuration.toFixed(2)}ms`);
  console.log('----------------------------------------------------\n');

  // Resource statistics
  let totalContentSize = 0;
  let resourcesWithParameters = 0;
  let resourcesWithEndpoints = 0;
  const titleLengths: number[] = [];

  for (const resource of resources) {
    totalContentSize += resource.content.length;
    titleLengths.push(resource.title.length);
    if (resource.hasParameters) resourcesWithParameters++;
    if (resource.endpointPattern) resourcesWithEndpoints++;
  }

  const avgContentSize = totalContentSize / resources.length;
  const avgTitleLength = titleLengths.reduce((sum, len) => sum + len, 0) / titleLengths.length;

  console.log('Resource Statistics:');
  console.log(`- Total Documentation Size: ${(totalContentSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- Average Resource Size: ${(avgContentSize / 1024).toFixed(2)} KB`);
  console.log(`- Resources with Parameter Tables: ${resourcesWithParameters} (${((resourcesWithParameters / resources.length) * 100).toFixed(1)}%)`);
  console.log(`- Resources with Endpoint Patterns: ${resourcesWithEndpoints} (${((resourcesWithEndpoints / resources.length) * 100).toFixed(1)}%)`);
  console.log(`- Average Title Length: ${avgTitleLength.toFixed(1)} characters`);
  console.log('----------------------------------------------------\n');

  // Create search index manually instead of using getSearchIndexForCollection
  // to avoid potential duplicate ID issues
  console.log('Building search index...');
  const indexStartTime = performance.now();

  // Create a new search index with the same configuration as in the main code
  const searchIndex = new MiniSearch<any>({
    fields: ['title', 'parameterData', 'content'],
    storeFields: ['title', 'hasParameters', 'endpointPattern'],
    searchOptions: {
      boost: { title: 3, parameterData: 2, content: 1 },
      fuzzy: 0.2,
      prefix: true
    },
    tokenize: (text) => {
      // Split on non-alphanumeric characters and underscores
      return text.split(/[\s\-\/\.,;:!\?\(\)]+/).filter(Boolean);
    },
    processTerm: (term, _fieldName) => {
      // Convert to lowercase
      term = term.toLowerCase();

      // Skip common stopwords
      const API_DOC_STOPWORDS = new Set([
        'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
        'gitlab', 'api', 'parameter', 'parameters', 'example'
      ]);

      if (API_DOC_STOPWORDS.has(term)) {
        return null;
      }

      // Skip very short terms (except IDs like "id")
      if (term.length < 3 && term !== 'id') {
        return null;
      }

      return term;
    }
  });

  // Add resources to the index, ensuring no duplicates
  const seenIds = new Set<string>();
  for (const resource of resources) {
    if (!seenIds.has(resource.id)) {
      searchIndex.add(resource);
      seenIds.add(resource.id);
    } else {
      console.warn(`Skipping duplicate ID: ${resource.id}`);
    }
  }

  const indexEndTime = performance.now();
  const indexDuration = indexEndTime - indexStartTime;

  console.log(`Built search index in ${indexDuration.toFixed(2)}ms`);

  // Display search index statistics
  const indexStats = {
    documentCount: searchIndex.documentCount,
    termCount: Object.keys((searchIndex as any)._fieldTerms?.title || {}).length +
               Object.keys((searchIndex as any)._fieldTerms?.content || {}).length +
               Object.keys((searchIndex as any)._fieldTerms?.parameterData || {}).length,
    fieldsCount: Object.keys((searchIndex as any)._fieldTerms || {}).length
  };

  console.log('Search Index Statistics:');
  console.log(`- Indexed Documents: ${indexStats.documentCount}`);
  console.log(`- Unique Terms: ${indexStats.termCount}`);
  console.log(`- Indexed Fields: ${indexStats.fieldsCount}`);
  console.log('----------------------------------------------------\n');

  // Run test searches
  const testQueries = [
    'create project',
    'list users',
    'merge request approve',
    'repository files',
    'pipeline triggers',
    'group variables',
    'project webhook',
    'issue labels',
    'deploy tokens',
    'runner registration'
  ];

  console.log('Running test searches...');

  for (const query of testQueries) {
    const searchStartTime = performance.now();
    const results = searchIndex.search(query, {
      boost: { title: 3, parameterData: 2, content: 1 },
      fuzzy: 0.2,
      prefix: true,
      combineWith: 'AND'
    });
    const searchEndTime = performance.now();
    const searchDuration = searchEndTime - searchStartTime;

    console.log(`\nQuery: "${query}"`);
    console.log(`- Search Time: ${searchDuration.toFixed(2)}ms`);
    console.log(`- Results Found: ${results.length}`);

    if (results.length > 0) {
      console.log('- Top 3 Results:');
      results.slice(0, 3).forEach((result, index) => {
        const resource = resources.find(r => r.id === result.id);
        if (!resource) return;

        console.log(`  ${index + 1}. ${resource.title} (score: ${result.score.toFixed(2)})`);
        console.log(`     Resource ID: ${resource.id}`);
        if (resource.endpointPattern) {
          console.log(`     Endpoint: ${resource.endpointPattern}`);
        }
        // Show how to use this ID in a subsequent MCP call
        console.log(`     MCP Call: mcp_GitLab_MCP_read_resource({ collection_id: 'gitlab-api-docs', resource_id: '${resource.id}' })`);
      });
    }
  }

  console.log('\n----------------------------------------------------');
  console.log('Diagnostics complete!');
}

/**
 * Diagnostics complete!
 */

// Check if this file is being run directly (ES module version)
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--diagnose') || args.includes('-d')) {
    runDiagnostics().catch(err => {
      console.error('Error running diagnostics:', err);
      process.exit(1);
    });
  } else {
    console.log('Usage: node gitlab-api-docs.js --diagnose');
    console.log('Run with --diagnose or -d flag to perform diagnostic tests on the GitLab API documentation');
  }
}
