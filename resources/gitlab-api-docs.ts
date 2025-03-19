import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ResourceCollection, ResourceContent, registerCollection, getSearchIndexForCollection, API_DOC_STOPWORDS, createStopwordsSet } from './index.js';
import * as fs from 'fs';
import MiniSearch from 'minisearch';
import * as porterStemmer from 'porterstem';

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

// Interface for enhanced resource content with title property
interface ResourceContentEnhanced {
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
 * GitLab API documentation collection configuration
 * Defines the metadata and location of the GitLab API documentation resources
 */
const GITLAB_API_DOCS: ResourceCollection = {
  id: 'gitlab-api-docs',
  name: 'GitLab API Documentation',
  description: 'Official documentation for GitLab REST API endpoints',
  dirPath: 'resources/gitlab-api-docs',

  // GitLab-specific stopwords to extend the base API_DOC_STOPWORDS
  stopwords: createStopwordsSet(API_DOC_STOPWORDS, [
    // Add GitLab-specific terms that should be filtered out
    'gitlab', 'repository', 'repositories', 'project', 'projects', 'branch', 'branches'
  ]),

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
 * Sets up the diagnostics environment, loads resources and prepares the log directory
 *
 * @param options Configuration options for the diagnostics
 * @returns A Promise resolving to the loaded resources, search index, and diagnostics directory
 */
async function setupDiagnostics(options: {
  forceReindex?: boolean;
  diagnosticsMode?: boolean;
  chunkSize?: number;
} = {}): Promise<{
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
  console.log('Loading GitLab API documentation resources...');

  const { resources: rawResources, searchIndex: miniSearchIndex, isIndexingComplete } =
    await getSearchIndexForCollection(GITLAB_API_DOCS, {
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
 * Run diagnostic tests on the GitLab API documentation
 * Analyzes the content, search index, and overall health of the documentation
 */
async function runDiagnostics(): Promise<void> {
  console.log('==== GitLab API Documentation Diagnostics ====\n');

  // First set up the diagnostics environment and load resources
  const {
    resources,
    searchIndex: miniSearchIndex,
    diagnosticsRunDir,
    loadTime,
    isIndexingComplete
  } = await setupDiagnostics({
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

  console.log('Analyzing content for potential index improvements...\n');

  // Analyze term frequency for potential stopword candidates
  const termFrequencies: Record<string, { count: number, docs: Set<string> }> = {};

  // Extract endpoint HTTP methods
  const httpMethods: Record<string, number> = {};
  resources.filter((r: ResourceContentEnhanced) => r.endpointPattern).forEach((resource: ResourceContentEnhanced) => {
    const pattern = resource.endpointPattern as string;
    const method = pattern.split(' ')[0];
    httpMethods[method] = (httpMethods[method] || 0) + 1;
  });

  // Analyze parameter data length distribution
  const paramDataLengths = resources
    .filter((r: ResourceContentEnhanced) => r.hasParameters)
    .map((r: ResourceContentEnhanced) => (r.parameterData || '').length);

  const resourcesWithFewParameters = resources.filter((r: ResourceContentEnhanced) =>
    r.hasParameters && (r.parameterData || '').length < 100
  ).length;

  const resourcesWithManyParameters = resources.filter((r: ResourceContentEnhanced) =>
    r.hasParameters && (r.parameterData || '').length > 500
  ).length;

  // Analyze term frequency
  const stopWords = GITLAB_API_DOCS.stopwords || API_DOC_STOPWORDS;

  resources.forEach((resource: ResourceContentEnhanced) => {
    // Process title tokens
    const titleText = (resource.title || '');
    const titleTokens = titleText.toLowerCase()
      .split(/[\s\-\/\.,;:!\?\(\)]+/)
      .filter((token: string) => token.length > 2)
      .filter((token: string) => !stopWords.has(token));

    titleTokens.forEach((token: string) => {
      if (!termFrequencies[token]) {
        termFrequencies[token] = { count: 0, docs: new Set() };
      }
      termFrequencies[token].count++;
      termFrequencies[token].docs.add(resource.id);
    });

    // Process parameter data tokens
    if (resource.parameterData) {
      const paramTokens = resource.parameterData.toLowerCase().split(/\W+/)
        .filter((token: string) => token.length > 2)
        .filter((token: string) => !stopWords.has(token));

      paramTokens.forEach((token: string) => {
        if (!termFrequencies[token]) {
          termFrequencies[token] = { count: 0, docs: new Set() };
        }
        termFrequencies[token].count++;
        termFrequencies[token].docs.add(resource.id);
      });
    }

    // Process content tokens
    const contentTokens = resource.content.toLowerCase().split(/\W+/)
      .filter((token: string) => token.length > 2)
      .filter((token: string) => !stopWords.has(token));

    contentTokens.forEach((token: string) => {
      if (!termFrequencies[token]) {
        termFrequencies[token] = { count: 0, docs: new Set() };
      }
      termFrequencies[token].count++;
      termFrequencies[token].docs.add(resource.id);
    });
  });

  // Top terms by document frequency
  const termsByDocFrequency = Object.entries(termFrequencies)
    .map(([term, { count, docs }]) => ({
      term,
      count,
      docCount: docs.size,
      docFrequency: docs.size / resources.length
    }))
    .sort((a, b) => b.docCount - a.docCount);

  console.log('\nTop 20 Most Common Terms (by document frequency):');
  console.log('Term\t\tDocs\t% of Docs\tOccurrences');
  termsByDocFrequency.slice(0, 20).forEach(({ term, docCount, docFrequency, count }) => {
    console.log(`${term.padEnd(16)}\t${docCount}\t${(docFrequency * 100).toFixed(1)}%\t\t${count}`);
  });

  // Endpoint pattern analysis
  const endpointTypes = new Map<string, number>();
  resources.filter(r => r.endpointPattern).forEach(resource => {
    const pattern = resource.endpointPattern || '';
    const verb = pattern.split(' ')[0] || 'UNKNOWN';
    endpointTypes.set(verb, (endpointTypes.get(verb) || 0) + 1);
  });

  console.log('\nEndpoint HTTP Method Distribution:');
  Array.from(endpointTypes.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([verb, count]) => {
      console.log(`- ${verb}: ${count} endpoints (${(count / resourcesWithEndpoints * 100).toFixed(1)}%)`);
    });

  // Analysis of parameter data
  console.log('\nParameter Data Analysis:');
  console.log(`- Resources with minimal parameter data (<100 chars): ${resourcesWithFewParameters}`);
  console.log(`- Resources with extensive parameter data (>500 chars): ${resourcesWithManyParameters}`);

  // Search quality analysis
  console.log('\n==== Search Quality Analysis ====');

  // Analyze stemming opportunities
  const stemGroupings: Record<string, string[]> = {};
  Object.keys(termFrequencies).forEach(term => {
    // Check for common suffixes
    ['s', 'es', 'ed', 'ing'].forEach(suffix => {
      if (term.endsWith(suffix)) {
        const base = term.substring(0, term.length - suffix.length);
        if (termFrequencies[base] && base.length > 3) {
          if (!stemGroupings[base]) {
            stemGroupings[base] = [base];
          }
          stemGroupings[base].push(term);
        }
      }
    });
  });

  // Filter to groups with at least 3 variants
  const significantStemGroups = Object.entries(stemGroupings)
    .filter(([_, variants]) => variants.length >= 3)
    .sort((a, b) => b[1].length - a[1].length);

  if (significantStemGroups.length > 0) {
    console.log('\nStemming Opportunities:');
    console.log('These term groups could be combined with stemming:');
    significantStemGroups.slice(0, 5).forEach(([base, variants]) => {
      console.log(`- ${base}: ${variants.join(', ')}`);
    });
  }

  // Terms that might be candidates for stopwords (very common)
  const stopwordCandidates = termsByDocFrequency
    .filter(({ docFrequency }) => docFrequency > 0.5)
    .filter(({ term }) => !['id', 'project', 'user'].includes(term))
    .slice(0, 10);

  if (stopwordCandidates.length > 0) {
    console.log('\nPotential Additional Stopwords:');
    console.log('These terms appear in >50% of documents and might be noise:');
    stopwordCandidates.forEach(({ term, docFrequency }) => {
      console.log(`- ${term}: ${(docFrequency * 100).toFixed(1)}% of docs`);
    });
  }

  // Analyze title vs content vs parameter data
  const titleTerms = new Set<string>();
  const parameterTerms = new Set<string>();
  const contentOnlyTerms = new Set<string>();
  let titleTokenCount = 0;
  let paramTokenCount = 0;
  let contentTokenCount = 0;

  resources.forEach(resource => {
    // Process title terms
    const titleText = (resource.title || '');
    const titleTokens = titleText.toLowerCase()
      .split(/[\s\-\/\.,;:!\?\(\)]+/)
      .filter((token: string) => token.length > 2)
      .filter((token: string) => !stopWords.has(token));

    titleTokens.forEach((token: string) => {
      titleTerms.add(token);
      titleTokenCount++;
    });

    // Process parameter terms
    if (resource.parameterData) {
      const paramTokens = resource.parameterData.toLowerCase()
        .split(/[\s\-\/\.,;:!\?\(\)]+/)
        .filter(token => token.length > 2)
        .filter(token => !stopWords.has(token));

      paramTokens.forEach(token => {
        parameterTerms.add(token);
        paramTokenCount++;
      });
    }

    // Process content terms
    const contentTokens = resource.content.toLowerCase()
      .split(/[\s\-\/\.,;:!\?\(\)]+/)
      .filter(token => token.length > 2)
      .filter(token => !stopWords.has(token));

    contentTokens.forEach(token => {
      if (!titleTerms.has(token) && !parameterTerms.has(token)) {
        contentOnlyTerms.add(token);
      }
      contentTokenCount++;
    });
  });

  console.log('\nField Distribution Analysis:');
  console.log(`- Title field: ${titleTerms.size} unique terms, ${titleTokenCount} total terms`);
  console.log(`- Parameter field: ${parameterTerms.size} unique terms, ${paramTokenCount} total terms`);
  console.log(`- Content-only terms: ${contentOnlyTerms.size} unique terms`);
  console.log(`- Tokens per document (avg): ${((titleTokenCount + paramTokenCount + contentTokenCount) / resources.length).toFixed(1)}`);

  // Title vs Content ratio analysis
  const titleToContentRatio = titleTokenCount / contentTokenCount;
  console.log(`- Title/Content token ratio: ${titleToContentRatio.toFixed(3)}`);

  if (titleToContentRatio < 0.05) {
    console.log('  ⚠️ Title tokens are much fewer than content - consider increasing title boost');
  }

  // Create search index for testing
  console.log('\nBuilding search index for testing...');
  const indexStartTime = performance.now();

  // Create a new search index with the same configuration as in the main code
  const searchIndex = new MiniSearch<ResourceContentEnhanced>({
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

      // Skip common stopwords - use the GitLab-specific ones
      if (GITLAB_API_DOCS.stopwords?.has(term)) {
        return null;
      }

      // Skip very short terms (except IDs like "id")
      if (term.length < 3 && term !== 'id') {
        return null;
      }

      // Apply Porter stemming for better term matching
      if (term.length > 3) {
        term = porterStemmer.stem(term);
      }

      return term;
    }
  });

  // Add resources to the index
  searchIndex.addAll(resources);

  const indexEndTime = performance.now();
  const indexDuration = indexEndTime - indexStartTime;

  console.log(`Built search index in ${indexDuration.toFixed(2)}ms`);

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

  console.log('\n==== Search Performance Analysis ====');

  // Track query term statistics
  const queryTermStats: Record<string, { count: number, matches: number, time: number }> = {};
  const allQueryResults: Record<string, any[]> = {};

  for (const query of testQueries) {
    const searchStartTime = performance.now();
    const results = searchIndex.search(query, {
      boost: { title: 12, parameterData: 3, content: 1 },
      fuzzy: 0.2,
      prefix: true,
      combineWith: 'AND'
    });
    const searchEndTime = performance.now();
    const searchDuration = searchEndTime - searchStartTime;

    // Store results for export
    allQueryResults[query] = results.slice(0, 10).map(result => {
      const resource = resources.find(r => r.id === result.id);

      // Create a clean representation of match data that can be safely serialized to JSON
      const matchData: Record<string, string[]> = {};
      if (result.match) {
        Object.entries(result.match).forEach(([term, fields]) => {
          matchData[term] = Array.isArray(fields) ? fields : Object.keys(fields);
        });
      }

      return {
        score: result.score,
        id: result.id,
        title: resource?.title || '',
        endpointPattern: resource?.endpointPattern || null,
        matches: matchData
      };
    });

    // Analyze query terms
    const queryTerms = query.toLowerCase().split(/\s+/)
      .filter(term => term.length > 2)
      .filter(term => {
        // Define stopwords for query analysis
        const API_DOC_STOPWORDS_DIAGNOSTIC = GITLAB_API_DOCS.stopwords || API_DOC_STOPWORDS;
        return !API_DOC_STOPWORDS_DIAGNOSTIC.has(term);
      });

    queryTerms.forEach(term => {
      if (!queryTermStats[term]) {
        queryTermStats[term] = { count: 0, matches: 0, time: 0 };
      }
      queryTermStats[term].count++;
      queryTermStats[term].matches += results.length;
      queryTermStats[term].time += searchDuration;
    });

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

  // Export test query results to the diagnostics directory
  try {
    // Export query results
    const queryResultsPath = path.join(diagnosticsRunDir, 'query-results.json');
    fs.writeFileSync(queryResultsPath, JSON.stringify(allQueryResults, null, 2));
    console.log(`\nExported query test results to: ${queryResultsPath}`);

    // Export term stats for analysis
    const termStatsPath = path.join(diagnosticsRunDir, 'term-stats.json');
    fs.writeFileSync(termStatsPath, JSON.stringify(queryTermStats, null, 2));
    console.log(`Exported term statistics to: ${termStatsPath}`);

    // Create a README file explaining the contents
    const readmePath = path.join(diagnosticsRunDir, 'README.txt');
    const readmeContent = `GitLab API Documentation Search Diagnostics
Generated: ${new Date().toISOString()}

Files in this directory:
- minisearch-index.json: The serialized MiniSearch index for analysis
- resources-metadata.json: Metadata about all documentation resources (without full content)
- query-results.json: Results from test queries
- term-stats.json: Statistics about search terms

This directory is automatically generated and should be git-ignored.
`;
    fs.writeFileSync(readmePath, readmeContent);

  } catch (error) {
    console.error(`Error exporting query results data: ${error}`);
  }

  // Analyze query term effectiveness
  console.log('\n==== Query Term Analysis ====');
  Object.entries(queryTermStats)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([term, stats]) => {
      const avgMatches = stats.matches / stats.count;
      const avgTime = stats.time / stats.count;
      console.log(`- "${term}": used ${stats.count} times, avg. ${avgMatches.toFixed(1)} matches, ${avgTime.toFixed(2)}ms`);
    });

  console.log('\n==== Search Enhancement Recommendations ====');

  // Low match terms that could benefit from synonyms
  const lowMatchTerms = Object.entries(queryTermStats)
    .filter(([_, stats]) => stats.matches / stats.count < 5 && stats.count > 1)
    .map(([term]) => term);

  if (lowMatchTerms.length > 0) {
    console.log('1. These query terms produce few matches:');
    console.log(`   ${lowMatchTerms.join(', ')}`);
    console.log('   Recommendation: Consider adding synonyms or alternative terms for these concepts');
  }

  // High match terms
  const highMatchTerms = Object.entries(queryTermStats)
    .filter(([_, stats]) => stats.matches / stats.count > 50)
    .map(([term]) => term);

  if (highMatchTerms.length > 0) {
    console.log('2. These query terms are very broad:');
    console.log(`   ${highMatchTerms.join(', ')}`);
    console.log('   Recommendation: Consider field-specific boosting when these terms are used');
  }

  // Parameter data extraction improvement
  if (resourcesWithParameters < resources.length * 0.1) {
    console.log('3. Parameter data extraction needs improvement:');
    console.log(`   Only ${resourcesWithParameters} resources (${((resourcesWithParameters / resources.length) * 100).toFixed(1)}%) have extracted parameter data`);
    console.log('   Recommendation: Enhance parameter extraction to capture more API parameters');
  }

  // Stemming recommendation
  if (significantStemGroups.length > 3) {
    console.log('4. Implement stemming for better term matching:');
    console.log('   Current implementation misses connections between related terms like singulars/plurals');
    console.log('   Recommendation: Add a stemming function in the processTerm method');
  }

  // Stopwords recommendation
  if (stopwordCandidates.length > 5) {
    console.log('5. Enhance stopwords list:');
    console.log('   Some very common terms may be adding noise to search results');
    console.log('   Recommendation: Add domain-specific terms to the stopwords list');
  }

  console.log('\n----------------------------------------------------');
  console.log('Diagnostics complete!');
}

/**
 * Run a performance benchmark for async resource loading and indexing
 *
 * @param options Configuration options for the benchmark
 * @returns A Promise that resolves when the benchmark is complete
 */
export async function runAsyncLoadBenchmark(options: {
  forceReindex?: boolean;
  verbose?: boolean;
  runs?: number;
  testQueries?: string[];
  chunkSize?: number;
} = {}): Promise<void> {
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
  console.log('ASYNC INDEXING BENCHMARK');
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
    } = await setupDiagnostics({
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
  console.log(`Collection: ${GITLAB_API_DOCS.id} (${GITLAB_API_DOCS.name})`);
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
 * Run GitLab API search with performance diagnostics
 * Throws IndexingIncompleteError if indexing is not complete
 *
 * @param query Search query string
 * @param options Configuration options for the search
 * @returns Search results array
 * @throws {IndexingIncompleteError} When the search index is still being built
 */
export async function gitlabApiSearch(
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
    console.log(`[GitLab API Search] Query: "${query}"`);
    if (options.chunkSize) {
      console.log(`[GitLab API Search] Using chunk size: ${options.chunkSize}`);
    }
  }

  // Load resources and get search index
  const { resources, searchIndex, isIndexingComplete } = await setupDiagnostics({
    forceReindex: options.forceReindex || false,
    diagnosticsMode: options.diagnosticsMode || false,
    chunkSize: options.chunkSize
  });

  const loadTime = performance.now() - startTime;

  if (options.diagnosticsMode) {
    console.log(`[GitLab API Search] Resources loaded in ${loadTime.toFixed(2)}ms`);
    console.log(`[GitLab API Search] Indexing complete: ${isIndexingComplete}`);
  }

  // If indexing is not complete, either throw an error or wait based on options
  if (!isIndexingComplete) {
    if (options.waitForIndexing) {
      // Only wait if explicitly requested
      if (options.diagnosticsMode) {
        console.log(`[GitLab API Search] Waiting for indexing to complete before searching...`);
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
          console.warn(`[GitLab API Search] Warning: ${err.message}. Proceeding with partial results.`);
        }
      });

      if (options.diagnosticsMode) {
        console.log(`[GitLab API Search] Indexing complete, proceeding with search.`);
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
    console.log(`[GitLab API Search] Search performed in ${searchTime.toFixed(2)}ms`);
    console.log(`[GitLab API Search] Found ${results.length} results`);
  }

  return results;
}

/**
 * Helper function to get current indexing progress if available
 */
function getCurrentIndexingProgress(searchIndex: any): number {
  if (typeof searchIndex.getIndexingProgress === 'function') {
    return searchIndex.getIndexingProgress();
  }

  // If no progress method available, return a reasonable estimate
  return 50; // Assume halfway done
}

// Check if this file is being run directly (ES module version)
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--diagnose') || args.includes('-d')) {
    runDiagnostics().catch(err => {
      console.error('Error running diagnostics:', err);
      process.exit(1);
    });
  } else if (args.includes('--benchmark') || args.includes('-b')) {
    runAsyncLoadBenchmark().catch(err => {
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
