import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import MiniSearch from 'minisearch';

/**
 * Interface defining a documentation resource collection
 * A collection groups related documentation resources under a single namespace
 */
export interface ResourceCollection {
  id: string;
  name: string;
  description: string;
  dirPath: string;
  getURLForFile?: (filePath: string) => string;
}

// List of available collections - populated by registered modules
const collections: ResourceCollection[] = [];

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
 * Cache structure for collection contents and search indices
 * Maintains loaded resources and search indices with timestamps
 */
interface CollectionCache {
  resources: ResourceFile[];
  searchIndex: MiniSearch<ResourceFile> | null;
  indexTimestamp: number;
}

/**
 * Represents a single resource file within a collection
 */
export interface ResourceFile {
  id: string;
  path: string;
  content: string;
  title: string;
  collection: string;
  hasParameters?: boolean;
  parameterData?: string;
  endpointPattern?: string;
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
 * Response structure for resource content retrieval
 */
interface ResourceContent {
  id: string;
  title: string;
  content: string;
  url?: string;
  hasParameters?: boolean;
  endpointPattern?: string;
}

/**
 * Response item for search results
 */
interface SearchResult {
  id: string;
  title: string;
  score: number;
  snippet: string;
  url?: string;
  hasParameters?: boolean;
  endpointPattern?: string;
}

// Cache for collection contents and search indices
const collectionCache: Record<string, CollectionCache> = {};

// Asynchronously read file
const readFileAsync = promisify(fs.readFile);

/**
 * Stopwords list specifically tailored for API documentation
 * Includes common English words and API-specific terms that aren't useful for search
 */
const API_DOC_STOPWORDS = new Set([
  // Common English stopwords
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
  'at', 'from', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from',
  'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can',
  'will', 'just', 'don', 'should', 'now',

  // Domain-specific overly common terms
  'gitlab', 'api', 'v4', 'request', 'response', 'returns', 'value', 'object',
  'data', 'example', 'parameter', 'parameters', 'required', 'optional',
  'default', 'type', 'string', 'integer', 'boolean', 'array'
]);

/**
 * General stopwords for search queries (smaller set than indexing stopwords)
 */
const SEARCH_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'this', 'that', 'these', 'those'
]);

/**
 * Extract the title from a markdown document
 * Handles GitLab-flavored markdown heading styles
 *
 * @param {string} content - The markdown content
 * @param {string} resourceId - Fallback resource ID to use if no title is found
 * @returns {string} The extracted title
 */
function extractTitle(content: string, resourceId: string): string {
  // Look for the first H1 heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Try H2 heading if no H1
  const h2Match = content.match(/^##\s+(.+)$/m);
  if (h2Match) {
    return h2Match[1].trim();
  }

  // Fallback to resourceId
  return resourceId
    .replace(/[-_]/g, ' ')
    .replace(/^\w|\s\w/g, match => match.toUpperCase());
}

/**
 * Extract parameter tables from GitLab API documentation
 * Finds markdown tables that contain parameter documentation
 *
 * @param {string} content - The markdown content
 * @returns {string} Extracted parameter information
 */
function extractParameterTables(content: string): string {
  // Match markdown tables with a header row containing "Parameter"
  const tableRegex = /\|\s*[Pp]arameter\s*\|[\s\S]+?(?=\n\n|\n#|$)/gi;

  let parameterText = '';
  let match;

  while ((match = tableRegex.exec(content)) !== null) {
    // Get the parameter table
    const table = match[0];

    // Extract rows from the table
    const rows = table.split('\n').filter(row => row.trim().startsWith('|'));

    // Skip the header row and separator row
    for (let i = 2; i < rows.length; i++) {
      const cells = rows[i].split('|').map(cell => cell.trim()).filter(Boolean);
      if (cells.length >= 2) {
        // Add parameter name and description to our text
        const paramName = cells[0];
        const paramDesc = cells.length >= 3 ? cells[cells.length - 1] : '';
        parameterText += `${paramName}: ${paramDesc} `;
      }
    }
  }

  return parameterText;
}

/**
 * Extract API endpoint patterns from GitLab API documentation
 * Finds REST API endpoint patterns like GET /api/v4/projects/:id/issues
 *
 * @param {string} content - The markdown content
 * @returns {string} Extracted endpoint pattern or empty string if none found
 */
function extractEndpointPattern(content: string): string {
  // Look for REST API endpoints (GET, POST, PUT, DELETE followed by a path)
  const endpointMatch = content.match(/\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[\w\/:_\-\.]+)/i);
  if (endpointMatch) {
    return endpointMatch[0];
  }

  // Look for plaintext blocks that look like API paths
  const plainPathMatch = content.match(/^```\s*plaintext\s*\n(\/[\w\/:_\-\.]+)/m);
  if (plainPathMatch) {
    return plainPathMatch[1];
  }

  return '';
}

/**
 * Initialize resource handling capabilities and register MCP handlers
 *
 * @param {any} mcp - The MCP server instance to register handlers with
 * @returns {Promise<void>} Promise that resolves when initialization is complete
 */
export async function initializeResources(mcp: any): Promise<void> {
  // Register resource handling functions
  mcp.onFunction('mcp_GitLab_MCP_list_collections', async () => {
    return collections.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description
    }));
  });

  mcp.onFunction('mcp_GitLab_MCP_list_resources', async (params: ListResourcesParams) => {
    const { collection_id } = params;

    // Validate collection exists
    const collection = collections.find(c => c.id === collection_id);
    if (!collection) {
      throw new Error(`Collection not found: ${collection_id}`);
    }

    // Load or use cached resources
    const resources = await getResourcesForCollection(collection);

    return resources.map(res => ({
      id: res.id,
      title: res.title,
      path: res.path,
      hasParameters: res.hasParameters,
      endpointPattern: res.endpointPattern
    })) as ResourceListItem[];
  });

  mcp.onFunction('mcp_GitLab_MCP_read_resource', async (params: ReadResourceParams) => {
    const { collection_id, resource_id } = params;

    // Validate collection exists
    const collection = collections.find(c => c.id === collection_id);
    if (!collection) {
      throw new Error(`Collection not found: ${collection_id}`);
    }

    // Load or use cached resources
    const resources = await getResourcesForCollection(collection);

    // Find the requested resource
    const resource = resources.find(r => r.id === resource_id);
    if (!resource) {
      throw new Error(`Resource not found: ${resource_id}`);
    }

    // Return the resource content and metadata
    return {
      id: resource.id,
      title: resource.title,
      content: resource.content,
      url: collection.getURLForFile ? collection.getURLForFile(resource.path) : undefined,
      hasParameters: resource.hasParameters,
      endpointPattern: resource.endpointPattern
    } as ResourceContent;
  });

  mcp.onFunction('mcp_GitLab_MCP_search_resources', async (params: SearchResourcesParams) => {
    const { collection_id, query, limit = 10 } = params;

    // Validate collection exists
    const collection = collections.find(c => c.id === collection_id);
    if (!collection) {
      throw new Error(`Collection not found: ${collection_id}`);
    }

    // Load or use cached resources and search index
    const { resources, searchIndex } = await getSearchIndexForCollection(collection);

    if (!searchIndex) {
      throw new Error(`Search index not available for collection: ${collection_id}`);
    }

    // Perform the search with custom options
    const searchResults = searchIndex.search(query, {
      boost: { title: 3, parameterData: 2, content: 1 },
      fuzzy: 0.2,
      prefix: true,
      combineWith: 'AND'
    });

    // Limit results if requested
    const limitedResults = limit > 0 ? searchResults.slice(0, limit) : searchResults;

    // Map search results to resources with context
    return limitedResults.map(result => {
      const resource = resources.find(r => r.id === result.id);
      if (!resource) return null;

      // Extract a snippet of content around the match
      const snippetContext = extractContentSnippet(resource.content, query);

      return {
        id: resource.id,
        title: resource.title,
        score: result.score,
        snippet: snippetContext,
        url: collection.getURLForFile ? collection.getURLForFile(resource.path) : undefined,
        hasParameters: resource.hasParameters,
        endpointPattern: resource.endpointPattern
      };
    }).filter(Boolean) as SearchResult[];
  });
}

/**
 * Get or load resources for a collection
 * Maintains a cache to avoid repeated disk reads
 *
 * @param {ResourceCollection} collection - The collection to get resources for
 * @returns {Promise<ResourceFile[]>} Promise resolving to an array of resource files
 */
export async function getResourcesForCollection(collection: ResourceCollection): Promise<ResourceFile[]> {
  // Check if we have a cache and if it's still valid
  const cacheMaxAgeMs = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();

  if (
    collectionCache[collection.id] &&
    (now - collectionCache[collection.id].indexTimestamp) < cacheMaxAgeMs
  ) {
    return collectionCache[collection.id].resources;
  }

  // Load resources from disk
  const resources = await loadResourcesFromCollection(collection);

  // Cache the results without a search index yet
  if (!collectionCache[collection.id]) {
    collectionCache[collection.id] = {
      resources,
      searchIndex: null,
      indexTimestamp: now
    };
  } else {
    collectionCache[collection.id].resources = resources;
    collectionCache[collection.id].indexTimestamp = now;
  }

  return resources;
}

/**
 * Get or create search index for a collection
 * Maintains a cache of search indices to improve performance
 *
 * @param {ResourceCollection} collection - The collection to get the search index for
 * @returns {Promise<CollectionCache>} Promise resolving to the collection cache with search index
 */
async function getSearchIndexForCollection(collection: ResourceCollection): Promise<CollectionCache> {
  // Check if we have a cache with a search index
  if (
    collectionCache[collection.id] &&
    collectionCache[collection.id].searchIndex
  ) {
    return collectionCache[collection.id];
  }

  // Get the resources first
  const resources = await getResourcesForCollection(collection);

  // Create a new search index
  const searchIndex = new MiniSearch<ResourceFile>({
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

      // Skip stopwords
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

  // Add all resources to the index
  searchIndex.addAll(resources);

  // Update the cache with the search index
  if (collectionCache[collection.id]) {
    collectionCache[collection.id].searchIndex = searchIndex;
  } else {
    collectionCache[collection.id] = {
      resources,
      searchIndex,
      indexTimestamp: Date.now()
    };
  }

  return collectionCache[collection.id];
}

/**
 * Load all resources from a collection directory
 * Reads markdown files from the directory structure
 *
 * @param {ResourceCollection} collection - The collection to load resources from
 * @returns {Promise<ResourceFile[]>} Promise resolving to an array of resource files
 */
export async function loadResourcesFromCollection(collection: ResourceCollection): Promise<ResourceFile[]> {
  const { dirPath, id: collectionId } = collection;
  const resources: ResourceFile[] = [];

  if (!fs.existsSync(dirPath)) {
    console.warn(`Collection directory not found: ${dirPath}`);
    return resources;
  }

  // Get all markdown files
  const files = await listAllFiles(dirPath);
  const markdownFiles = files.filter(file => file.endsWith('.md'));

  // Process each markdown file
  for (const file of markdownFiles) {
    try {
      const content = await readFileAsync(file, 'utf8');
      const relativePath = path.relative(dirPath, file);

      // Generate resource ID from the relative path without extension
      const resourceId = path.basename(relativePath, '.md');

      // Extract title using enhanced extraction logic
      const title = extractTitle(content, resourceId);

      // Extract parameter table information
      const parameterData = extractParameterTables(content);

      // Extract API endpoint pattern
      const endpointPattern = extractEndpointPattern(content);

      // Create an enhanced content that prioritizes parameter information
      const enhancedContent = title + '\n\n' +
                             (parameterData ? 'Parameters: ' + parameterData + '\n\n' : '') +
                             (endpointPattern ? 'Endpoint: ' + endpointPattern + '\n\n' : '') +
                             content;

      resources.push({
        id: resourceId,
        path: relativePath,
        content: enhancedContent, // Use enhanced content for search
        title,
        collection: collectionId,
        hasParameters: parameterData.length > 0,
        parameterData,
        endpointPattern: endpointPattern || undefined
      });
    } catch (error) {
      console.error(`Error loading resource ${file}:`, error);
    }
  }

  return resources;
}

/**
 * Extract a snippet of content around search matches
 * Creates a context-aware excerpt highlighting search terms
 *
 * @param {string} content - The full content to extract a snippet from
 * @param {string} query - The search query to find in the content
 * @returns {string} A snippet of content with context around matches
 */
function extractContentSnippet(content: string, query: string): string {
  // Normalize content and query for matching
  const normalizedContent = content.toLowerCase();
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean)
    .filter(term => !SEARCH_STOPWORDS.has(term));

  // Find positions of all query terms in the content
  const matchPositions: number[] = [];
  queryTerms.forEach(term => {
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
  const matchPos = matchPositions[Math.floor(matchPositions.length / 2)]; // Middle match

  // Define snippet window
  const snippetLength = 200;
  const windowStart = Math.max(0, matchPos - snippetLength / 2);
  const windowEnd = Math.min(content.length, matchPos + snippetLength / 2);

  // Extract snippet
  let snippet = content.substring(windowStart, windowEnd);

  // Add ellipsis if needed
  if (windowStart > 0) snippet = '...' + snippet;
  if (windowEnd < content.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Recursively list all files in a directory
 * Traverses subdirectories to find all files
 *
 * @param {string} dir - The directory to list files from
 * @returns {Promise<string[]>} Promise resolving to an array of file paths
 */
export async function listAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recursively process subdirectories
      files.push(...await listAllFiles(fullPath));
    } else {
      // Add file to the list
      files.push(fullPath);
    }
  }

  return files;
}
