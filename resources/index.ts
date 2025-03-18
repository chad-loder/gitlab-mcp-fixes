import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { promisify } from 'util';
import MiniSearch from 'minisearch';

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
}

/**
 * Interface for resource content objects
 */
export interface ResourceContent {
  id: string;
  collectionId: string;
  content: string;
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

// Cache for collection search indices
const searchIndicesCache: Record<string, MiniSearch<ResourceContent>> = {};

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
 * Includes English stopwords, domain-specific overly common terms, and
 * terms identified through diagnostics that appear in >90% of documents
 */
const API_DOC_STOPWORDS = new Set([
  // Common English stopwords
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in',
  'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the',
  'their', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'will', 'with',

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

  // Get the last part of the ID if it's a hierarchical ID
  const simpleId = resourceId.includes('/')
    ? resourceId.split('/').pop() || resourceId
    : resourceId;

  // Fallback to humanized resourceId
  return simpleId
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
 * Gets or creates a search index for a collection
 *
 * @param collection The resource collection to create a search index for
 * @returns A Promise that resolves to the search index and resources
 */
export async function getSearchIndexForCollection(collection: ResourceCollection): Promise<{
  searchIndex: MiniSearch<ResourceContent>;
  resources: ResourceContent[]
}> {
  const { id: collectionId } = collection;

  if (!collectionContentsCache[collectionId]) {
    collectionContentsCache[collectionId] = await loadResourcesFromCollection(collection);
  }

  let resources = collectionContentsCache[collectionId];

  if (!searchIndicesCache[collectionId]) {
    // Create field extractors
    const extractTitle = (content: string, resourceId: string): string => {
      // Try to find an H1 heading (# Title)
      const h1Match = content.match(/^#\s+(.+?)(?:\r?\n|$)/m);
      if (h1Match) return h1Match[1].trim();

      // Try to find an H2 heading (## Title)
      const h2Match = content.match(/^##\s+(.+?)(?:\r?\n|$)/m);
      if (h2Match) return h2Match[1].trim();

      // Default to a humanized version of the resource ID if no title found
      const basename = resourceId.split('/').pop() || '';
      return basename.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    };

    const extractParameterData = (content: string): string => {
      // Match markdown tables that have a header row containing "Parameter"
      const tableRegex = /\|[^|]*Parameter[^|]*\|[^|]*\|[\s\S]*?(?=\n\n|\n#|\n$)/g;
      const tables = content.match(tableRegex);

      if (!tables) return '';

      // Process each table to extract parameter names and descriptions
      return tables.map((table: string) => {
        const rows = table.split('\n');
        // Skip header row and separator row (first two rows of markdown table)
        return rows.slice(2).map((row: string) => {
          // Extract content from cells (split by | and remove leading/trailing |)
          const cells = row.split('|').slice(1, -1).map((cell: string) => cell.trim());
          if (cells.length >= 2) {
            return `${cells[0]} ${cells[1]}`;
          }
          return '';
        }).join(' ');
      }).join(' ');
    };

    const extractEndpointPattern = (content: string): string | null => {
      // Match common REST API endpoint patterns (HTTP method + path)
      const endpointMatch = content.match(/\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/[a-zA-Z0-9\/_:.-]+)\b/);
      return endpointMatch ? `${endpointMatch[1]} ${endpointMatch[2]}` : null;
    };

    // Pre-process resources to extract fields
    resources = resources.map(resource => {
      const title = extractTitle(resource.content, resource.id);
      const parameterData = extractParameterData(resource.content);
      const endpointPattern = extractEndpointPattern(resource.content);
      const hasParameters = parameterData.length > 0;

      return {
        ...resource,
        title,
        parameterData,
        endpointPattern,
        hasParameters
      };
    });

    // Update cache with enriched resources
    collectionContentsCache[collectionId] = resources;

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

        // Skip common stopwords
        if (API_DOC_STOPWORDS.has(term)) {
          return null;
        }

        // Skip very short terms (except IDs like "id")
        if (term.length < 3 && term !== 'id') {
          return null;
        }

        // Basic stemming for English words
        if (term.length > 3) {
          // Handle plurals
          if (term.endsWith('ies') && term.length > 4) {
            term = term.substring(0, term.length - 3) + 'y';
          } else if (term.endsWith('es') && term.length > 3) {
            term = term.substring(0, term.length - 2);
          } else if (term.endsWith('s') && !term.endsWith('ss') && term.length > 3) {
            term = term.substring(0, term.length - 1);
          }

          // Handle verb forms
          if (term.endsWith('ed') && term.length > 4) {
            if (term.endsWith('ied') && term.length > 4) {
              term = term.substring(0, term.length - 3) + 'y';
            } else if (term.endsWith('ed') && term.length > 3) {
              term = term.substring(0, term.length - 2);
            }
          } else if (term.endsWith('ing') && term.length > 5) {
            // remove ing and possibly add back an 'e'
            const stemmed = term.substring(0, term.length - 3);
            // If removing 'ing' results in a word ending with a consonant followed by a single vowel followed
            // by a single consonant, we double the final consonant and then remove the 'ing'
            const doubledConsonantPattern = /[bcdfghjklmnpqrstvwxz][aeiou][bcdfghjklmnpqrstvwxz]$/;
            if (doubledConsonantPattern.test(stemmed) && term.length > 6) {
              term = stemmed.substring(0, stemmed.length - 1);
            } else {
              term = stemmed;
            }
          }

          // Handle common suffixes
          if (term.endsWith('ly') && term.length > 4) {
            term = term.substring(0, term.length - 2);
          } else if (term.endsWith('ment') && term.length > 6) {
            term = term.substring(0, term.length - 4);
          } else if (term.endsWith('ness') && term.length > 5) {
            term = term.substring(0, term.length - 4);
          } else if (term.endsWith('ity') && term.length > 5) {
            term = term.substring(0, term.length - 3) + 'e';
          } else if (term.endsWith('tion') && term.length > 5) {
            term = term.substring(0, term.length - 3) + 'e';
          }
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

    // Add all resources to the index
    searchIndex.addAll(resources);
    searchIndicesCache[collectionId] = searchIndex;
  }

  return {
    searchIndex: searchIndicesCache[collectionId],
    resources
  };
}

/**
 * Loads resources from a collection, specifically targeting markdown files.
 *
 * @param collection The resource collection to load
 * @returns A Promise that resolves to an array of resource content objects
 */
async function loadResourcesFromCollection(collection: ResourceCollection): Promise<ResourceContent[]> {
  const resourcesPath = collection.dirPath;
  const resourceContents: ResourceContent[] = [];

  try {
    // Get absolute directory path
    const absoluteDirPath = path.isAbsolute(resourcesPath)
      ? resourcesPath
      : path.join(process.cwd(), resourcesPath);

    // Get all files (these are already absolute paths)
    const files = await listAllFilesInDir(resourcesPath);
    const markdownFiles = files.filter(file => file.endsWith('.md'));

    for (const filePath of markdownFiles) {
      // Since filePath is already absolute, we need to get the relative path from the absolute dir
      const relativePath = path.relative(absoluteDirPath, filePath);
      const resourceId = `${collection.id}/${relativePath.replace(/\.md$/, '')}`;

      try {
        const fileContent = await fs.promises.readFile(filePath, 'utf8');

        resourceContents.push({
          id: resourceId,
          collectionId: collection.id,
          content: fileContent,
          url: collection.getURLForFile ? collection.getURLForFile(relativePath) : undefined
        });
      } catch (err) {
        console.error(`Error reading file ${filePath}:`, err);
      }
    }
  } catch (err) {
    console.error(`Error loading resources from ${resourcesPath}:`, err);
  }

  return resourceContents;
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
