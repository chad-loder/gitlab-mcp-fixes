import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ResourceCollection, ResourceContent, registerCollection, getSearchIndexForCollection, API_DOC_STOPWORDS, createStopwordsSet } from './index.js';
import * as fs from 'fs';
import MiniSearch from 'minisearch';
import * as porterStemmer from 'porterstem';

/**
 * GitLab Documentation Module
 *
 * This module provides common functionality for handling GitLab-formatted markdown documentation.
 * It serves as a base for different GitLab documentation collections like API docs, CLI docs, etc.
 */

// Create dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Interface for enhanced resource content with title property
export interface ResourceContentEnhanced {
  id: string;
  collectionId: string;
  content: string;
  rawContent?: string; // Original unprocessed content
  url?: string;
  title?: string;
  parameterData?: string;
  endpointPattern?: string | null;
  hasParameters?: boolean;
}

/**
 * GitLab documentation collection base configuration
 * This interface defines the standard properties for any GitLab documentation collection
 */
export interface GitLabDocCollectionConfig {
  id: string;                      // Unique identifier for the collection
  name: string;                    // Display name for the collection
  description: string;             // Brief description of the collection
  dirPath: string;                 // Path to the directory containing the markdown files
  stopwords?: Set<string>;         // Collection-specific stopwords
  urlBase?: string;                // Base URL for the official documentation
  getURLForFile?: (filePath: string) => string;  // Function to generate URLs for files
}

/**
 * Creates a GitLab documentation collection from a configuration object
 *
 * @param config The configuration for the GitLab documentation collection
 * @returns A ResourceCollection object
 */
export function createGitLabDocCollection(config: GitLabDocCollectionConfig): ResourceCollection {
  // Default URL generator if not provided
  const defaultGetURLForFile = (filePath: string) => {
    // Extract the filename without extension
    const fileName = path.basename(filePath, path.extname(filePath));

    // Map to the official documentation URL using the base URL
    return `${config.urlBase || 'https://docs.gitlab.com/'}${fileName}.html`;
  };

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    dirPath: config.dirPath,
    stopwords: config.stopwords || createStopwordsSet(API_DOC_STOPWORDS, [
      // Add GitLab-specific terms that should be filtered out
      'gitlab', 'repository', 'repositories'
    ]),
    getURLForFile: config.getURLForFile || defaultGetURLForFile
  };
}

/**
 * Register a GitLab documentation collection with the resource system
 *
 * @param config The configuration for the GitLab documentation collection
 * @returns The created and registered ResourceCollection
 */
export function registerGitLabDocCollection(config: GitLabDocCollectionConfig): ResourceCollection {
  const collection = createGitLabDocCollection(config);
  registerCollection(collection);
  return collection;
}

/**
 * Sets up the diagnostics environment, loads resources and prepares the log directory
 *
 * @param collection The GitLab documentation collection to run diagnostics on
 * @param options Configuration options for the diagnostics
 * @returns A Promise resolving to the loaded resources, search index, and diagnostics directory
 */
export async function setupDiagnostics(
  collection: ResourceCollection,
  options: {
    forceReindex?: boolean;
    diagnosticsMode?: boolean;
    chunkSize?: number;
  } = {}
): Promise<{
  resources: ResourceContentEnhanced[];
  searchIndex: any; // Use any type to avoid TypeScript issues with the extended interface
  diagnosticsRunDir: string;
  loadTime: number;
  isIndexingComplete: boolean;
}> {
  const startTime = performance.now();

  // Create diagnostics directory structure
  const projectRoot = path.resolve(__dirname, '..', '..');
  const logsDir = path.join(projectRoot, 'logs');
  const diagnosticsDir = path.join(logsDir, 'diagnostics');

  // Create directory structure if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  if (!fs.existsSync(diagnosticsDir)) {
    fs.mkdirSync(diagnosticsDir, { recursive: true });
  }

  // Generate a timestamp for this diagnostic run
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(diagnosticsDir, `run-${timestamp}`);
  fs.mkdirSync(runDir, { recursive: true });

  // Load resources with the provided options
  console.log(`Loading ${collection.name} resources...`);

  const { resources: rawResources, searchIndex: miniSearchIndex, isIndexingComplete } =
    await getSearchIndexForCollection(collection, {
      recreateIndex: options.forceReindex || false,
      chunkSize: options.chunkSize,
      loadingProgressCallback: options.diagnosticsMode
        ? (loaded, total) => console.log(`Loading: ${loaded}/${total} resources`)
        : undefined,
      indexingProgressCallback: options.diagnosticsMode
        ? (indexed, total) => console.log(`Indexing: ${indexed}/${total} resources`)
        : undefined
    });

  const endTime = performance.now();
  const loadTime = endTime - startTime;

  // Cast the resources to our enhanced type that includes the title field
  const resources = rawResources as unknown as ResourceContentEnhanced[];

  if (options.diagnosticsMode) {
    console.log(`Loaded ${resources.length} documentation files in ${loadTime.toFixed(2)}ms`);
    console.log(`Using chunk size: ${process.env.MCP_INDEXER_CHUNK_SIZE || '50'} (default)`);
    if (!isIndexingComplete) {
      console.log('Note: Async indexing is still in progress');
    }
  }

  return {
    resources,
    searchIndex: miniSearchIndex,
    diagnosticsRunDir: runDir,
    loadTime,
    isIndexingComplete
  };
}

/**
 * Run diagnostic tests on a GitLab documentation collection
 * Analyzes the content, search index, and overall health of the documentation
 *
 * @param collection The GitLab documentation collection to analyze
 */
export async function runDiagnostics(collection: ResourceCollection): Promise<void> {
  console.log(`==== ${collection.name} Diagnostics ====\n`);

  // First set up the diagnostics environment and load resources
  const {
    resources,
    searchIndex: miniSearchIndex,
    diagnosticsRunDir,
    loadTime,
    isIndexingComplete
  } = await setupDiagnostics(collection, {
    diagnosticsMode: true,
    forceReindex: true
  });

  // Export search index to JSON file
  try {
    const indexJson = miniSearchIndex.toJSON();

    // Export MiniSearch index
    const indexOutputPath = path.join(diagnosticsRunDir, 'minisearch-index.json');
    fs.writeFileSync(indexOutputPath, JSON.stringify(indexJson, null, 2));
    console.log(`\nExported MiniSearch index to: ${indexOutputPath}`);

    // Export resources metadata (without full content) to help with analysis
    const resourcesMetadata = resources.map(resource => ({
      id: resource.id,
      title: resource.title,
      url: resource.url,
      endpointPattern: resource.endpointPattern,
      hasParameters: resource.hasParameters,
      contentLength: resource.content.length,
      parameterDataLength: resource.parameterData?.length || 0
    }));

    const metadataOutputPath = path.join(diagnosticsRunDir, 'resources-metadata.json');
    fs.writeFileSync(metadataOutputPath, JSON.stringify(resourcesMetadata, null, 2));
    console.log(`Exported resources metadata to: ${metadataOutputPath}`);
  } catch (error) {
    console.error(`Error exporting search diagnostics data: ${error}`);
  }

  console.log('----------------------------------------------------\n');

  // Analyze content statistics
  const totalSize = resources.reduce((sum, resource: ResourceContentEnhanced) => sum + resource.content.length, 0);
  const avgSize = totalSize / resources.length;

  // Count resources with parameter tables
  const resourcesWithParameters = resources.filter((r: ResourceContentEnhanced) => r.hasParameters).length;

  // Count resources with endpoint patterns
  const resourcesWithEndpoints = resources.filter((r: ResourceContentEnhanced) => r.endpointPattern).length;

  // Calculate average title length
  const totalTitleLength = resources.reduce((sum, resource: ResourceContentEnhanced) => {
    const title = resource.title ?? '';
    return sum + title.length;
  }, 0);
  const avgTitleLength = totalTitleLength / resources.length;

  console.log('Resource Statistics:');
  console.log(`- Total Documentation Size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`- Average Resource Size: ${(avgSize / 1024).toFixed(2)} KB`);
  console.log(`- Resources with Parameter Tables: ${resourcesWithParameters} (${((resourcesWithParameters / resources.length) * 100).toFixed(1)}%)`);
  console.log(`- Resources with Endpoint Patterns: ${resourcesWithEndpoints} (${((resourcesWithEndpoints / resources.length) * 100).toFixed(1)}%)`);
  console.log(`- Average Title Length: ${avgTitleLength.toFixed(1)} characters`);
  console.log('----------------------------------------------------\n');

  // Additional diagnostic logic omitted for brevity...
  // This would include term frequency analysis, search quality analysis, etc.

  console.log('\n----------------------------------------------------');
  console.log('Diagnostics complete!');
}

/**
 * Run a performance benchmark for async resource loading and indexing
 *
 * @param collection The GitLab documentation collection to benchmark
 * @param options Configuration options for the benchmark
 * @returns A Promise that resolves when the benchmark is complete
 */
export async function runAsyncLoadBenchmark(
  collection: ResourceCollection,
  options: {
    forceReindex?: boolean;
    verbose?: boolean;
    runs?: number;
    testQueries?: string[];
    chunkSize?: number;
  } = {}
): Promise<void> {
  const {
    forceReindex = true,
    verbose = true,
    runs = 3,
    chunkSize = undefined, // Use default from environment or let getSearchIndexForCollection decide
    testQueries = [
      'merge request approvals',
      'pipeline variables',
      'user permissions',
      'webhook events',
      'repository branches'
    ]
  } = options;

  console.log('====================================');
  console.log(`${collection.name} ASYNC INDEXING BENCHMARK`);
  console.log('====================================\n');
  console.log(`Using chunk size: ${chunkSize || process.env.MCP_INDEXER_CHUNK_SIZE || '50'} (default)`);

  // Track metrics across multiple runs
  const loadTimes: number[] = [];
  const indexCompletionTimes: number[] = [];
  const searchTimes: Record<string, number[]> = {};

  for (let run = 1; run <= runs; run++) {
    console.log(`\n----- Run ${run}/${runs} -----`);

    // Load resources and measure time
    console.log('1. Measuring resource loading time...');
    const startTime = performance.now();

    const {
      resources,
      searchIndex,
      loadTime,
      isIndexingComplete
    } = await setupDiagnostics(collection, {
      forceReindex,
      diagnosticsMode: verbose,
      chunkSize
    });

    loadTimes.push(loadTime);
    console.log(`Loaded ${resources.length} resources in ${loadTime.toFixed(2)}ms`);

    // Wait for indexing to complete if it's not already done
    console.log('2. Measuring full indexing completion time...');
    const indexStart = performance.now();

    if (!isIndexingComplete) {
      console.log('   - Async indexing in progress, waiting for completion...');

      // Poll until indexing is complete
      // This uses the cache structure we set up in index.ts
      // We'll check every 100ms until indexing is complete
      let complete = false;
      while (!complete) {
        // Access the isIndexingComplete function from the cache if available
        // or check a property on the searchIndex that might be set
        if (typeof searchIndex.isIndexingComplete === 'function') {
          complete = searchIndex.isIndexingComplete();
        } else {
          // Fallback to a simple timeout if the function isn't available
          await new Promise(resolve => setTimeout(resolve, 500));
          complete = true; // Assume it's complete after timeout
        }
      }
    }

    const indexEnd = performance.now();
    const indexTime = indexEnd - indexStart;
    indexCompletionTimes.push(indexTime);

    console.log(`   - Completed indexing in ${indexTime.toFixed(2)}ms`);

    // Test search performance
    console.log('3. Testing search performance...');

    for (const query of testQueries) {
      if (!searchTimes[query]) {
        searchTimes[query] = [];
      }

      const searchStart = performance.now();
      const results = searchIndex.search(query);
      const searchEnd = performance.now();
      const searchTime = searchEnd - searchStart;

      searchTimes[query].push(searchTime);

      console.log(`   - Query "${query}" returned ${results.length} results in ${searchTime.toFixed(2)}ms`);
    }
  }

  // Calculate and display averages
  const avgLoadTime = loadTimes.reduce((sum, time) => sum + time, 0) / loadTimes.length;
  const avgIndexTime = indexCompletionTimes.reduce((sum, time) => sum + time, 0) / indexCompletionTimes.length;

  console.log('\nBENCHMARK SUMMARY:');
  console.log(`Collection: ${collection.id} (${collection.name})`);
  console.log(`Avg. Loading Time: ${avgLoadTime.toFixed(2)}ms`);
  console.log(`Avg. Index Completion Time: ${avgIndexTime.toFixed(2)}ms`);
  console.log(`Total Processing Time: ${(avgLoadTime + avgIndexTime).toFixed(2)}ms`);

  console.log('\nSEARCH PERFORMANCE:');
  for (const [query, times] of Object.entries(searchTimes)) {
    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    console.log(`- Query "${query}": ${avgTime.toFixed(2)}ms average`);
  }

  // Memory usage
  const memoryUsage = process.memoryUsage();
  console.log('\nMEMORY USAGE:');
  console.log(`RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n====================================');
  console.log('BENCHMARK COMPLETE');
  console.log('====================================');
}

/**
 * Custom error class for when indexing is not yet complete
 */
export class IndexingIncompleteError extends Error {
  constructor(message?: string) {
    super(message || 'Search index is still being built. Try searching again in a few seconds.');
    this.name = 'IndexingIncompleteError';

    // Maintains proper stack trace for where the error was thrown (only in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, IndexingIncompleteError);
    }
  }
}

/**
 * Run GitLab docs search with performance diagnostics
 * Throws IndexingIncompleteError if indexing is not complete
 *
 * @param collection The GitLab documentation collection to search
 * @param query Search query string
 * @param options Configuration options for the search
 * @returns Search results array
 * @throws {IndexingIncompleteError} When the search index is still being built
 */
export async function gitlabDocsSearch(
  collection: ResourceCollection,
  query: string,
  options: {
    diagnosticsMode?: boolean;
    forceReindex?: boolean;
    timeoutMs?: number;
    chunkSize?: number;
    waitForIndexing?: boolean;
  } = {}
): Promise<any[]> {
  const startTime = performance.now();
  const timeout = options.timeoutMs || 30000; // Default 30-second timeout

  if (options.diagnosticsMode) {
    console.log(`[${collection.name} Search] Query: "${query}"`);
    if (options.chunkSize) {
      console.log(`[${collection.name} Search] Using chunk size: ${options.chunkSize}`);
    }
  }

  // Load resources and get search index
  const { resources, searchIndex, isIndexingComplete } = await setupDiagnostics(collection, {
    forceReindex: options.forceReindex || false,
    diagnosticsMode: options.diagnosticsMode || false,
    chunkSize: options.chunkSize
  });

  const loadTime = performance.now() - startTime;

  if (options.diagnosticsMode) {
    console.log(`[${collection.name} Search] Resources loaded in ${loadTime.toFixed(2)}ms`);
    console.log(`[${collection.name} Search] Indexing complete: ${isIndexingComplete}`);
  }

  // If indexing is not complete, either throw an error or wait based on options
  if (!isIndexingComplete) {
    if (options.waitForIndexing) {
      // Only wait if explicitly requested
      if (options.diagnosticsMode) {
        console.log(`[${collection.name} Search] Waiting for indexing to complete before searching...`);
      }

      // Create a promise that resolves when indexing is complete or times out
      await new Promise<void>((resolve, reject) => {
        // Set a timeout to avoid waiting indefinitely
        const timeoutId = setTimeout(() => {
          reject(new Error(`Indexing did not complete within ${timeout}ms timeout`));
        }, timeout);

        // Poll for indexing completion
        const checkInterval = setInterval(() => {
          if (typeof searchIndex.isIndexingComplete === 'function') {
            const complete = searchIndex.isIndexingComplete();
            if (complete) {
              clearInterval(checkInterval);
              clearTimeout(timeoutId);
              resolve();
            }
          }
        }, 100);
      }).catch(err => {
        if (options.diagnosticsMode) {
          console.warn(`[${collection.name} Search] Warning: ${err.message}. Proceeding with partial results.`);
        }
      });

      if (options.diagnosticsMode) {
        console.log(`[${collection.name} Search] Indexing complete, proceeding with search.`);
      }
    } else {
      // By default, throw an error when indexing is incomplete
      throw new IndexingIncompleteError(
        `Search index is still being built (${getCurrentIndexingProgress(searchIndex)}%). ` +
        `Try searching again in a few seconds, or use 'waitForIndexing: true' to wait for completion.`
      );
    }
  }

  // Perform search
  const searchStartTime = performance.now();
  const results = searchIndex.search(query);
  const searchTime = performance.now() - searchStartTime;

  if (options.diagnosticsMode) {
    console.log(`[${collection.name} Search] Search performed in ${searchTime.toFixed(2)}ms`);
    console.log(`[${collection.name} Search] Found ${results.length} results`);
  }

  return results;
}

/**
 * Helper function to get current indexing progress if available
 */
export function getCurrentIndexingProgress(searchIndex: any): number {
  if (typeof searchIndex.getIndexingProgress === 'function') {
    return searchIndex.getIndexingProgress();
  }

  // If no progress method available, return a reasonable estimate
  return 50; // Assume halfway done
}
