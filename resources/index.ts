import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import MiniSearch from 'minisearch';

// Define interfaces for resource handling
export interface ResourceCollection {
  id: string;
  name: string;
  description: string;
  dirPath: string;
  getURLForFile?: (filePath: string) => string;
}

// List of available collections - populated by registered modules
const collections: ResourceCollection[] = [];

// Public registry function to register a collection
export function registerCollection(collection: ResourceCollection): void {
  // Check for duplicate IDs
  if (collections.find(c => c.id === collection.id)) {
    console.warn(`Collection with ID ${collection.id} already registered. Skipping.`);
    return;
  }
  collections.push(collection);
}

// Cache for collection contents and search indices
interface CollectionCache {
  resources: ResourceFile[];
  searchIndex: MiniSearch<ResourceFile> | null;
  indexTimestamp: number;
}

export interface ResourceFile {
  id: string;
  path: string;
  content: string;
  title: string;
  collection: string;
}

interface ListCollectionsParams {
  // No parameters needed for listing collections
}

interface ListResourcesParams {
  collection_id: string;
}

interface ReadResourceParams {
  collection_id: string;
  resource_id: string;
}

interface SearchResourcesParams {
  collection_id: string;
  query: string;
  limit?: number;
}

// Resource response interfaces
interface ResourceListItem {
  id: string;
  title: string;
  path: string;
}

interface ResourceContent {
  id: string;
  title: string;
  content: string;
  url?: string;
}

interface SearchResult {
  id: string;
  title: string;
  score: number;
  snippet: string;
  url?: string;
}

const collectionCache: Record<string, CollectionCache> = {};

// Asynchronously read file
const readFileAsync = promisify(fs.readFile);

// Initialize resources and register handlers
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
      path: res.path
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
      url: collection.getURLForFile ? collection.getURLForFile(resource.path) : undefined
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
      boost: { title: 2 },
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
        url: collection.getURLForFile ? collection.getURLForFile(resource.path) : undefined
      };
    }).filter(Boolean) as SearchResult[];
  });
}

// Get or load resources for a collection
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

// Get or create search index for a collection
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
    fields: ['title', 'content'],
    storeFields: ['title'],
    searchOptions: {
      boost: { title: 2 },
      fuzzy: 0.2,
      prefix: true
    },
    tokenize: (text) => text.toLowerCase().split(/[\s\-_\/\.]+/)
  });

  // Add all resources to the index
  searchIndex.addAll(resources);

  // Update the cache with the search index
  collectionCache[collection.id].searchIndex = searchIndex;

  return collectionCache[collection.id];
}

// Load all markdown files from a collection directory
export async function loadResourcesFromCollection(collection: ResourceCollection): Promise<ResourceFile[]> {
  const resources: ResourceFile[] = [];

  const files = await listAllFiles(collection.dirPath);
  const markdownFiles = files.filter(file => file.endsWith('.md'));

  for (const filePath of markdownFiles) {
    try {
      const content = await readFileAsync(filePath, 'utf8');

      // Extract a title from the first heading or use the filename
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : path.basename(filePath, '.md');

      // Generate a resource ID from the path (relative to the collection dir)
      const relativePath = path.relative(collection.dirPath, filePath);
      const id = relativePath.replace(/\.md$/, '').replace(/[\\/]/g, '-');

      resources.push({
        id,
        path: filePath,
        content,
        title,
        collection: collection.id
      });
    } catch (err) {
      console.error(`Error loading resource file ${filePath}:`, err);
    }
  }

  return resources;
}

// Extract a snippet of content around a search match
function extractContentSnippet(content: string, query: string): string {
  // Convert query terms to a regex pattern
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const pattern = new RegExp(`(${terms.join('|')})`, 'i');

  // Find a match in the content
  const match = content.match(pattern);
  if (!match) {
    // If no match found, return the beginning of the content
    return content.slice(0, 200) + '...';
  }

  // Find the paragraph containing the match
  const paragraphs = content.split(/\n\n+/);
  const matchingParagraph = paragraphs.find(p => p.match(pattern));

  if (matchingParagraph) {
    // If the paragraph is short enough, return it
    if (matchingParagraph.length < 300) {
      return matchingParagraph;
    }

    // Otherwise, extract a context around the match
    const matchIndex = matchingParagraph.toLowerCase().indexOf(match[0].toLowerCase());
    const start = Math.max(0, matchIndex - 100);
    const end = Math.min(matchingParagraph.length, matchIndex + match[0].length + 100);

    return (start > 0 ? '...' : '') +
           matchingParagraph.slice(start, end) +
           (end < matchingParagraph.length ? '...' : '');
  }

  // Fallback: extract context around the match in the full content
  const matchIndex = content.toLowerCase().indexOf(match[0].toLowerCase());
  const start = Math.max(0, matchIndex - 100);
  const end = Math.min(content.length, matchIndex + match[0].length + 100);

  return (start > 0 ? '...' : '') +
         content.slice(start, end) +
         (end < content.length ? '...' : '');
}

// Recursively list all files in a directory
export async function listAllFiles(dir: string): Promise<string[]> {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });

  const files = await Promise.all(dirents.map(dirent => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? listAllFiles(res) : [res];
  }));

  return files.flat();
}
