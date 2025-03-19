import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ResourceCollection, ResourceContent, registerCollection, getSearchIndexForCollection, API_DOC_STOPWORDS, createStopwordsSet } from './index.js';
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

// Interface for enhanced resource content with title property
interface ResourceContentEnhanced {
  id: string;
  collectionId: string;
  content: string;
  url?: string;
  hasParameters?: boolean;
  parameterData?: string;
  endpointPattern?: string | null;
  title?: string;
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
 * Run diagnostic tests on the GitLab API documentation
 * Analyzes the content, search index, and overall health of the documentation
 */
async function runDiagnostics(): Promise<void> {
  console.log('==== GitLab API Documentation Diagnostics ====\n');
  console.log('Loading GitLab API documentation resources...');

  const startTime = performance.now();
  const { resources: rawResources, searchIndex: miniSearchIndex } = await getSearchIndexForCollection(GITLAB_API_DOCS);
  const endTime = performance.now();
  const duration = endTime - startTime;

  // Cast the resources to our enhanced type that includes the title field
  const resources = rawResources as unknown as ResourceContentEnhanced[];

  // Export search index to JSON file
  try {
    const indexJson = miniSearchIndex.toJSON();

    // Create logs directory at the root level (sibling to main directory)
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

    // Export MiniSearch index
    const indexOutputPath = path.join(runDir, 'minisearch-index.json');
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

    const metadataOutputPath = path.join(runDir, 'resources-metadata.json');
    fs.writeFileSync(metadataOutputPath, JSON.stringify(resourcesMetadata, null, 2));
    console.log(`Exported resources metadata to: ${metadataOutputPath}`);

    // Store the diagnostics directory path for later use
    const diagnosticsRunDir = runDir;
  } catch (error) {
    console.error(`Error exporting search diagnostics data: ${error}`);
  }

  console.log(`Loaded ${resources.length} documentation files in ${duration.toFixed(2)}ms`);
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
    // Create logs directory at the root level (sibling to main directory)
    const projectRoot = path.resolve(__dirname, '..', '..');
    const logsDir = path.join(projectRoot, 'logs');
    const diagnosticsDir = path.join(logsDir, 'diagnostics');

    // Find the most recent run directory
    const dirs = fs.readdirSync(diagnosticsDir).filter(dir => dir.startsWith('run-'));
    dirs.sort();
    const latestRunDir = dirs.length > 0 ? path.join(diagnosticsDir, dirs[dirs.length - 1]) : null;

    if (!latestRunDir) {
      throw new Error('Could not find run directory to save query results');
    }

    // Export query results
    const queryResultsPath = path.join(latestRunDir, 'query-results.json');
    fs.writeFileSync(queryResultsPath, JSON.stringify(allQueryResults, null, 2));
    console.log(`\nExported query test results to: ${queryResultsPath}`);

    // Export term stats for analysis
    const termStatsPath = path.join(latestRunDir, 'term-stats.json');
    fs.writeFileSync(termStatsPath, JSON.stringify(queryTermStats, null, 2));
    console.log(`Exported term statistics to: ${termStatsPath}`);

    // Create a README file explaining the contents
    const readmePath = path.join(latestRunDir, 'README.txt');
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
