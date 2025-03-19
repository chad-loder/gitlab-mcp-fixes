import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import MiniSearch from 'minisearch';
import * as fs from 'fs';
import { promisify } from 'util';
import * as porterStemmer from 'porterstem';
import { processorRegistry, BaseIndexingProcessor } from './processors/index.js';
import { minimatch } from 'minimatch';

// Create dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Interface for resource collection configurations
 */
export interface ResourceCollection {
  id: string;
  name: string;
  description: string;
  dirPath: string;
  getURLForFile?: (filePath: string) => string;
  stopwords?: Set<string>; // Optional set of collection-specific stopwords
  preprocessContent?: (content: string) => string;
  fieldProcessors?: Record<string, (content: string) => string>;

  // Add processor configuration options
  processors?: {
    [pattern: string]: BaseIndexingProcessor;
  };

  // Content filtering options
  content?: {
    includes?: string[];
    excludes?: string[];
    contentRoot?: string;
  };
}

/**
 * Represents the content of a resource document
 */
export interface ResourceContent {
  id: string;
  collectionId: string;
  content: string;   // Processed content for indexing
  rawContent?: string; // Original unprocessed content
  url?: string;
  title?: string;
  parameterData?: string;
  endpointPattern?: string | null;
  hasParameters?: boolean;
}

// List of all available resource collections
export const collections: ResourceCollection[] = [];

// Cache for collection contents
const collectionContentsCache: Record<string, ResourceContent[]> = {};

// Cache for collection search indices with metadata
interface SearchIndexCacheEntry {
  index: MiniSearch<ResourceContent>;
  indexingPromise: Promise<void>;
  isIndexingComplete: () => boolean;
  getIndexingProgress?: () => number; // Method to get progress percentage
}

// Cache for collection search indices
const searchIndicesCache: Record<string, SearchIndexCacheEntry> = {};

// Get the default chunk size from environment variable or use sensible default
const DEFAULT_CHUNK_SIZE = parseInt(process.env.MCP_INDEXER_CHUNK_SIZE || '20', 10);

// Validate chunk size is a reasonable number
const getValidChunkSize = (requestedSize?: number): number => {
  if (!requestedSize) return DEFAULT_CHUNK_SIZE;
  // Ensure chunk size is between 1 and 1000
  return Math.max(1, Math.min(1000, requestedSize));
};

// Reference to the server instance
let serverInstance: any = null;

/**
 * Register a new resource collection in the system
 *
 * @param {ResourceCollection} collection - The collection to register
 */
export function registerCollection(collection: ResourceCollection): void {
  // Check for duplicate IDs
  if (collections.find(c => c.id === collection.id)) {
    console.warn(`Collection with ID ${collection.id} already registered. Skipping.`);
    return;
  }
  collections.push(collection);
}

/**
 * Parameters for listing collections
 */
interface ListCollectionsParams {
  // No parameters needed for listing collections
}

/**
 * Parameters for listing resources within a collection
 */
interface ListResourcesParams {
  collection_id: string;
}

/**
 * Parameters for reading a specific resource
 */
interface ReadResourceParams {
  collection_id: string;
  resource_id: string;
}

/**
 * Parameters for searching resources within a collection
 */
interface SearchResourcesParams {
  collection_id: string;
  query: string;
  limit?: number;
}

/**
 * Response item for resource listings
 */
interface ResourceListItem {
  id: string;
  title: string;
  path: string;
  hasParameters?: boolean;
  endpointPattern?: string;
}

/**
 * Response item for search results
 */
interface SearchResult {
  id: string;                   // Resource ID for use with mcp_GitLab_MCP_read_resource
  resource_id: string;          // Alias of id, for clarity in MCP calls
  title: string;
  score: number;
  snippet: string;
  url?: string;
  hasParameters?: boolean;
  endpointPattern?: string;
}

// Asynchronously read file
const readFileAsync = promisify(fs.readFile);

/**
 * Common stopwords to filter out when indexing and searching API documentation
 * Base set of stopwords that apply to all resource collections
 */
export const BASE_STOPWORDS = new Set([
  // Common English stopwords
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in',
  'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the',
  'their', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'will', 'with',
  'when', 'else', 'how', 'what', 'where', 'who', 'why'
]);

/**
 * Common API and technical documentation stopwords
 * These apply to API documentation collections specifically
 */
export const API_DOC_STOPWORDS = new Set([
  // Start with all base stopwords
  ...Array.from(BASE_STOPWORDS),

  // Domain-specific overly common terms
  'api', 'gitlab', 'parameter', 'parameters', 'example', 'examples', 'response',
  'request', 'endpoint', 'field', 'value', 'true', 'false', 'null', 'object',

  // Additional stopwords identified through diagnostics (>90% document frequency)
  'see', 'https', 'com', 'stage', 'info', 'determine', 'technical', 'writer',
  'assigned', 'associated', 'page', 'handbook', 'product', 'writing', 'title',
  'details'
]);

/**
 * General stopwords for search queries (smaller set than indexing stopwords)
 * Used specifically for query analysis, not document indexing
 */
export const SEARCH_STOPWORDS = new Set([
  ...Array.from(BASE_STOPWORDS)
]);

/**
 * Helper function to create a custom stopwords set for a specific collection
 * Starts with base stopwords and adds collection-specific terms
 *
 * @param baseSet - The base set of stopwords to extend
 * @param additionalTerms - Array of additional terms to add as stopwords
 * @returns A new Set containing the combined stopwords
 */
export function createStopwordsSet(baseSet: Set<string> = BASE_STOPWORDS, additionalTerms: string[] = []): Set<string> {
  return new Set([
    ...Array.from(baseSet),
    ...additionalTerms
  ]);
}

/**
 * Initializes the resource handling capability for the server.
 *
 * @param server The server instance to register resource handlers on
 */
export function initializeResources(server: any): void {
  serverInstance = server;

  // Register handlers for resource capabilities
  server.registerCapability('resources.list_collections', async () => {
    return { collections };
  });

  server.registerCapability('resources.list_collection', async (req: { collection_id: string }) => {
    const { collection_id } = req;
    const collection = collections.find(c => c.id === collection_id);

    if (!collection) {
      throw new Error(`Collection not found: ${collection_id}`);
    }

    const resources = await getResourcesForCollection(collection);

    return {
      resources: resources.map(resource => ({
        id: resource.id,
        collection_id: resource.collectionId,
        url: resource.url
      }))
    };
  });

  server.registerCapability('resources.read_resource', async (req: { collection_id: string, resource_id: string }) => {
    const { collection_id, resource_id } = req;
    const collection = collections.find(c => c.id === collection_id);

    if (!collection) {
      throw new Error(`Collection not found: ${collection_id}`);
    }

    const resources = await getResourcesForCollection(collection);
    const resource = resources.find(r => r.id === resource_id);

    if (!resource) {
      throw new Error(`Resource not found: ${resource_id}`);
    }

    return {
      id: resource.id,
      collection_id: resource.collectionId,
      content: resource.content,
      url: resource.url
    };
  });

  server.registerCapability('resources.search_collection', async (req: {
    collection_id: string,
    query: string,
    limit?: number,
    fuzzy?: number,
    prefix?: boolean,
    boost?: {
      title?: number,
      parameterData?: number,
      content?: number
    },
    fields?: Array<'title' | 'parameterData' | 'content'>
  }) => {
    // Use the searchCollection function to avoid code duplication
    return searchCollection(req);
  });
}

/**
 * Gets resources for a collection, using cache if available
 *
 * @param collection The collection to get resources for
 * @returns A Promise that resolves to an array of resource content objects
 */
export async function getResourcesForCollection(collection: ResourceCollection): Promise<ResourceContent[]> {
  const { id: collectionId } = collection;

  if (!collectionContentsCache[collectionId]) {
    collectionContentsCache[collectionId] = await loadResourcesFromCollection(collection);
  }

  return collectionContentsCache[collectionId];
}

/**
 * Lists all files in a directory recursively
 *
 * @param dirPath The path of the directory to list files from
 * @returns A Promise that resolves to an array of file paths
 */
async function listAllFilesInDir(dirPath: string): Promise<string[]> {
  const allFiles: string[] = [];

  // Convert to absolute path if it's a relative path
  const absoluteDirPath = path.isAbsolute(dirPath)
    ? dirPath
    : path.join(process.cwd(), dirPath);

  async function traverseDir(currentPath: string) {
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await traverseDir(fullPath);
      } else {
        allFiles.push(fullPath);
      }
    }
  }

  await traverseDir(absoluteDirPath);
  return allFiles;
}

/**
 * Loads resources from a collection by reading files from disk
 *
 * @param collection The resource collection to load
 * @param options Additional options for loading
 * @returns A Promise resolving to an array of resource contents
 */
async function loadResourcesFromCollection(
  collection: ResourceCollection,
  options: {
    batchSize?: number;
    concurrentFiles?: number;
    progressCallback?: (loaded: number, total: number) => void;
  } = {}
): Promise<ResourceContent[]> {
  const resources: ResourceContent[] = [];

  // Default options
  const {
    batchSize = 10,          // Number of files to process in each batch
    concurrentFiles = 5,     // Number of files to process concurrently
    progressCallback         // Optional callback for progress updates
  } = options;

  try {
    console.log(`Loading resources from collection: ${collection.id} (${collection.name})`);

    // Load the collection-specific configuration if available
    let collectionConfig;

    try {
      // First try to load the collection-specific config
      const configModule = await import(`./config/${collection.id}.mjs`);
      collectionConfig = configModule.default;
      console.log(`Loaded configuration for collection: ${collection.id}`);
    } catch (e) {
      // If no collection-specific config exists, use the default
      const defaultConfig = await import('./config/default.mjs');
      collectionConfig = defaultConfig.default;
      console.log(`Using default configuration for collection: ${collection.id}`);
    }

    // Configure the processor registry with the collection config
    processorRegistry.setCollectionConfig(collectionConfig);

    // Register collection-specific processors if provided
    if (collection.processors) {
      for (const [pattern, processor] of Object.entries(collection.processors)) {
        processorRegistry.register(pattern, processor);
      }
    }

    // Get absolute directory path
    const absoluteDirPath = path.isAbsolute(collection.dirPath)
      ? collection.dirPath
      : path.join(process.cwd(), collection.dirPath);

    // Get all files (these are already absolute paths)
    const files = await listAllFilesInDir(collection.dirPath);
    const markdownFiles = files.filter(file => file.endsWith('.md'));

    // Filter out files that don't match our patterns
    const filesToProcess = markdownFiles.filter(filePath => {
      const relativePath = path.relative(absoluteDirPath, filePath);

      // Check against content.includes patterns
      const shouldInclude = (collection.content?.includes || ['**/*.md']).some(pattern =>
        minimatch(relativePath, pattern));

      // Check against content.excludes patterns
      const shouldExclude = (collection.content?.excludes || []).some(pattern =>
        minimatch(relativePath, pattern));

      return shouldInclude && !shouldExclude;
    });

    console.log(`Found ${filesToProcess.length} markdown files to process`);

    // Process files in batches to avoid memory issues
    for (let i = 0; i < filesToProcess.length; i += batchSize) {
      const batch = filesToProcess.slice(i, i + batchSize);

      // Process files in the batch concurrently
      const batchPromises = [];

      for (let j = 0; j < batch.length; j += concurrentFiles) {
        const concurrentBatch = batch.slice(j, j + concurrentFiles);

        // Create an array of promises for concurrent processing
        const promises = concurrentBatch.map(async (filePath) => {
          try {
            const relativePath = path.relative(absoluteDirPath, filePath);
            const resourceId = relativePath.replace(/\.md$/, '');

            // Read the file content
            const fileContent = await fs.promises.readFile(filePath, 'utf8');

            // Process the content asynchronously
            const processedContent = await processorRegistry.processContentAsync(filePath, fileContent);

            // Apply custom preprocessing if provided by the collection
            const finalContent = collection.preprocessContent
              ? collection.preprocessContent(processedContent)
              : processedContent;

            // Generate a URL for the resource if the collection provides a URL generator
            const url = collection.getURLForFile ? collection.getURLForFile(filePath) : undefined;

            // Add the resource to our collection
            return {
              id: resourceId,
              collectionId: collection.id,
              content: finalContent,
              url
            };
          } catch (err) {
            console.error(`Error processing file ${filePath}:`, err);
            return null;
          }
        });

        // Wait for all promises in this concurrent batch to resolve
        const results = await Promise.all(promises);

        // Add valid results to resources
        results.filter(Boolean).forEach(resource => resources.push(resource as ResourceContent));

        // Call progress callback if provided
        if (progressCallback) {
          progressCallback(Math.min(i + j + concurrentBatch.length, filesToProcess.length), filesToProcess.length);
        }
      }
    }

    console.log(`Loaded ${resources.length} resources from ${collection.id}`);
  } catch (err) {
    console.error(`Error loading resources from ${collection.dirPath}:`, err);
  }

  return resources;
}

/**
 * Gets or creates a search index for a collection with improved async processing
 *
 * @param collection The resource collection to create a search index for
 * @param options Configuration options for indexing
 * @returns A Promise that resolves to the search index and resources
 */
export async function getSearchIndexForCollection(
  collection: ResourceCollection,
  options: {
    chunkSize?: number;
    recreateIndex?: boolean;
    loadingProgressCallback?: (loaded: number, total: number) => void;
    indexingProgressCallback?: (indexed: number, total: number) => void;
  } = {}
): Promise<{
  searchIndex: MiniSearch<ResourceContent>;
  resources: ResourceContent[];
  isIndexingComplete: boolean;
}> {
  const { id: collectionId } = collection;

  // Default options
  const {
    chunkSize = getValidChunkSize(options.chunkSize),
    recreateIndex = false,     // Whether to recreate the index if it already exists
    loadingProgressCallback,   // Callback for loading progress
    indexingProgressCallback   // Callback for indexing progress
  } = options;

  // Check if we have a cached index and resources and if we're allowed to use them
  const hasCachedResources = Boolean(collectionContentsCache[collectionId]);
  const hasCachedIndex = Boolean(searchIndicesCache[collectionId]);

  if (recreateIndex) {
    // Clear the caches if we're recreating the index
    delete collectionContentsCache[collectionId];
    delete searchIndicesCache[collectionId];
  }

  // Load resources if not already cached
  if (!hasCachedResources || recreateIndex) {
    collectionContentsCache[collectionId] = await loadResourcesFromCollection(collection, {
      batchSize: chunkSize,
      concurrentFiles: 5,
      progressCallback: loadingProgressCallback
    });
  }

  let resources = collectionContentsCache[collectionId];

  // Create a new search index if needed
  if (!hasCachedIndex || recreateIndex) {
    // Get the appropriate processor instance for extraction tasks
    // Import it here to avoid circular dependencies
    const { processorRegistry } = await import('./processors/index.js');

    // Pre-process resources to extract fields in small batches
    // This is CPU intensive, so we do it in chunks
    const enhancedResources: ResourceContent[] = [];
    for (let i = 0; i < resources.length; i += chunkSize) {
      // Get a chunk of resources to process
      const chunk = resources.slice(i, i + chunkSize);

      // Process each resource in the chunk
      const processed = chunk.map(resource => {
        // Get the appropriate processor for this resource
        const processor = processorRegistry.getProcessorForFile(
          `${collectionId}/${resource.id}.md`
        );

        // Use the processor to extract metadata
        const title = processor.extractTitle(resource.content, resource.id);
        const parameterData = processor.extractParameterData(resource.content);
        const endpointPattern = processor.extractEndpointPattern(resource.content);
        const hasParameters = parameterData.length > 0;

        return {
          ...resource,
          title,
          parameterData,
          endpointPattern,
          hasParameters
        };
      });

      // Add the processed resources to our result
      enhancedResources.push(...processed);

      // Call progress callback if provided
      if (indexingProgressCallback) {
        indexingProgressCallback(Math.min(i + chunk.length, resources.length), resources.length);
      }

      // Allow the event loop to run other tasks
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Update the resources with the enhanced versions
    resources = enhancedResources;
    collectionContentsCache[collectionId] = resources;

    // Create a new search index with our configuration
    const searchIndex = new MiniSearch({
      idField: 'id',
      fields: ['title', 'parameterData', 'content'],
      storeFields: ['id', 'collectionId', 'title', 'hasParameters', 'endpointPattern', 'url'],

      // Custom tokenizer that preserves identifiers with underscores
      tokenize: (text) => {
        // Split on spaces and other delimiters while preserving words with underscores
        const regex = /[a-zA-Z0-9_]+|[^\s\w]+/g;
        const matches = text.match(regex) || [];
        return matches.filter(Boolean);
      },

      // Process terms for case normalization and stopword filtering
      processTerm: (term, _fieldName) => {
        // Convert to lowercase
        term = term.toLowerCase();

        // Skip common stopwords - use the collection-specific set if available
        const collectionStopwords = collection.stopwords || API_DOC_STOPWORDS;
        if (collectionStopwords.has(term)) {
          return null;
        }

        // Skip very short terms (except IDs like "id")
        if (term.length < 3 && term !== 'id') {
          return null;
        }

        // Apply Porter stemming algorithm for better term matching
        if (term.length > 3) {
          term = porterStemmer.stem(term);
        }

        return term;
      },

      // Default search options
      searchOptions: {
        boost: { title: 12, parameterData: 3, content: 1 }, // Higher boost for titles
        fuzzy: 0.2,
        prefix: true
      }
    });

    // Add resources to the index asynchronously in chunks
    // This allows the event loop to handle other tasks
    let indexingComplete = false;
    let indexedCount = 0;
    const totalCount = resources.length;

    // Store the promise that resolves when indexing is complete
    const indexingPromise = (async () => {
      console.log(`Adding ${resources.length} resources to search index in chunks of ${chunkSize}`);

      // Process resources in chunks
      for (let i = 0; i < resources.length; i += chunkSize) {
        const chunk = resources.slice(i, Math.min(i + chunkSize, resources.length));

        // Add this chunk to the index using MiniSearch's addAllAsync for better performance
        await searchIndex.addAllAsync(chunk);

        // Update progress
        indexedCount = Math.min(i + chunkSize, resources.length);
        if (indexingProgressCallback) {
          indexingProgressCallback(indexedCount, totalCount);
        }

        // Allow other tasks to run between chunks
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      console.log(`Finished adding resources to search index`);
      indexingComplete = true;
    })();

    // Store both the index and the indexing promise in the cache
    searchIndicesCache[collectionId] = {
      index: searchIndex,
      indexingPromise,
      isIndexingComplete: () => indexingComplete,
      getIndexingProgress: () => Math.round((indexedCount / totalCount) * 100)
    };

    return {
      searchIndex,
      resources,
      isIndexingComplete: indexingComplete
    };
  }

  // Return the cached index and resources
  return {
    searchIndex: searchIndicesCache[collectionId].index,
    resources,
    isIndexingComplete: searchIndicesCache[collectionId].isIndexingComplete()
  };
}

/**
 * Search for resources in a collection
 *
 * @param params Search parameters including collection_id, query, and search options
 * @returns Promise with search results
 */
export async function searchCollection(params: {
  collection_id: string,
  query: string,
  limit?: number,
  fuzzy?: number,
  prefix?: boolean,
  boost?: {
    title?: number,
    parameterData?: number,
    content?: number
  },
  fields?: Array<'title' | 'parameterData' | 'content'>
}): Promise<{ resources: any[] }> {
  const {
    collection_id,
    query,
    limit = 10,
    fuzzy,
    prefix,
    boost,
    fields
  } = params;

  const collection = collections.find(c => c.id === collection_id);

  if (!collection) {
    throw new Error(`Collection not found: ${collection_id}`);
  }

  // Get search index and resources
  const { searchIndex, resources } = await getSearchIndexForCollection(collection);

  // Setup search options using provided parameters or defaults
  const searchOptions: any = {};

  // Set fuzzy matching tolerance if specified
  if (fuzzy !== undefined) {
    searchOptions.fuzzy = fuzzy;
  }

  // Set prefix matching if specified
  if (prefix !== undefined) {
    searchOptions.prefix = prefix;
  }

  // Set field boosting if specified
  if (boost) {
    searchOptions.boost = {};
    if (boost.title !== undefined) searchOptions.boost.title = boost.title;
    if (boost.parameterData !== undefined) searchOptions.boost.parameterData = boost.parameterData;
    if (boost.content !== undefined) searchOptions.boost.content = boost.content;
  }

  // Set fields to search in if specified
  if (fields && fields.length > 0) {
    searchOptions.fields = fields;
  }

  // Perform the search with configured options
  const searchResults = searchIndex.search(query, searchOptions);

  // Map results to resources with context
  const resourceResults = searchResults.slice(0, limit).map(result => {
    const resource = resources.find(r => r.id === result.id);

    if (!resource) {
      return null;
    }

    // Get content around matches for context
    const queryTerms = query.split(/\s+/).filter(term => term.length > 2);
    const snippet = getSnippetFromContent(resource.content, queryTerms);

    return {
      id: resource.id,
      collection_id: resource.collectionId,
      score: result.score,
      title: resource.title,
      snippet: snippet,
      url: resource.url,
      endpointPattern: resource.endpointPattern,
      hasParameters: resource.hasParameters
    };
  }).filter(Boolean);

  return { resources: resourceResults };
}

export function getSnippetFromContent(content: string, queryTerms: string[]): string {
  if (!content || !queryTerms || queryTerms.length === 0) {
    return content.substring(0, 200) + (content.length > 200 ? '...' : '');
  }

  // Join query terms for processor-based extraction
  const query = queryTerms.join(' ');

  // Use the processor registry to handle the extraction
  try {
    // This is a synchronous method, so we can't import dynamically here
    // Instead, we use the exported processorRegistry which should be available
    const { processorRegistry } = require('./processors/index.js');

    // Use the default processor for snippet extraction
    // This will use the most appropriate processor's implementation
    const processor = processorRegistry.getProcessorForFile('snippet.md');
    return processor.extractContentSnippet(content, query);
  } catch (err) {
    console.error('Error using processor for snippet extraction:', err);

    // Fallback to the original implementation if processor is unavailable
    const normalizedContent = content.toLowerCase();
    const normalizedTerms = queryTerms.map(term => term.toLowerCase());

    const matchPositions: number[] = [];
    normalizedTerms.forEach(term => {
      let pos = normalizedContent.indexOf(term);
      while (pos !== -1) {
        matchPositions.push(pos);
        pos = normalizedContent.indexOf(term, pos + 1);
      }
    });

    if (matchPositions.length === 0) {
      // No exact matches, return the start of the content
      return content.substring(0, 200) + (content.length > 200 ? '...' : '');
    }

    // Sort positions and choose the most representative match
    matchPositions.sort((a, b) => a - b);

    // Better snippet extraction: Get a window around the first match
    // but try to include additional matches if they're close
    let primaryMatchPos = matchPositions[0];

    // If we have multiple matches, try to find a good cluster of matches
    if (matchPositions.length > 2) {
      // Calculate distances between consecutive matches
      const diffs = [];
      for (let i = 1; i < matchPositions.length; i++) {
        diffs.push({
          pos: matchPositions[i-1],
          diff: matchPositions[i] - matchPositions[i-1]
        });
      }

      // Find the position with most matches in proximity (within 100 chars)
      const matchClusters = diffs.filter(d => d.diff < 100);
      if (matchClusters.length > 0) {
        // Use the start of the densest cluster as our primary position
        primaryMatchPos = matchClusters[0].pos;
      }
    }

    // Define snippet window - make it larger to capture more context
    const snippetLength = 300;
    const windowStart = Math.max(0, primaryMatchPos - snippetLength / 3);
    const windowEnd = Math.min(content.length, primaryMatchPos + snippetLength * 2/3);

    // Extract snippet
    let snippet = content.substring(windowStart, windowEnd);

    // Add ellipsis if needed
    if (windowStart > 0) snippet = '...' + snippet;
    if (windowEnd < content.length) snippet = snippet + '...';

    return snippet;
  }
}
