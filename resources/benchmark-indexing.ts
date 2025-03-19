// Benchmarking script for measuring indexing performance
import { ResourceCollection, getSearchIndexForCollection } from './index.js';
import { SearchResult } from 'minisearch';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the current directory in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isInBuildDir = __dirname.includes('/build/') || __dirname.includes('\\build\\');

// If we're running from the build directory, adjust paths accordingly
if (isInBuildDir) {
  // Set NODE_PATH to include the parent directory to help with imports
  process.env.NODE_PATH = path.join(__dirname, '../..');
  console.log('Running from build directory, adjusting paths...');

  // Move up one level to the build directory root
  process.chdir(path.join(__dirname, '..'));
}

// Configuration for benchmarking
const RUNS_PER_CHUNK_SIZE = 3; // Number of runs to average for each chunk size
const TEST_QUERIES: string[] = [
  'merge request approvals',
  'pipeline variables',
  'user permissions',
  'webhook events',
  'repository branches'
];

// Chunk sizes to test
const CHUNK_SIZES: number[] = [1, 5, 10, 20, 50];

// Store collections globally to access in the benchmark
let collections: ResourceCollection[] = [];

// Initialize collections before running benchmark
async function initializeCollections(): Promise<ResourceCollection[]> {
  try {
    // Try to load collections from the index module
    const { loadCollections } = await import('./index.js');
    if (typeof loadCollections === 'function') {
      return await loadCollections();
    }
  } catch (err) {
    console.error('Failed to load collections:', err);
  }
  return [];
}

/**
 * Interface for benchmark results
 */
interface ChunkSizeResult {
  avgLoadingTime: number;
  avgIndexingTime: number;
  avgSearchTime: number;
  avgTotalTime: number;
  resourceCount: number;
}

/**
 * Results by chunk size
 */
interface ResultsByChunkSize {
  [chunkSize: string]: ChunkSizeResult;
}

/**
 * Shuffles an array in-place using the Fisher-Yates algorithm
 * @param array The array to shuffle
 * @returns The same array, now shuffled
 */
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Run a complete indexing benchmark with different chunk sizes
 */
export async function runBenchmark(): Promise<void> {
  console.log('====================================');
  console.log('RESOURCE INDEXING BENCHMARK');
  console.log('====================================\n');

  // Load collections
  collections = await initializeCollections();

  // Check if we have collections to test with
  if (!collections || !collections.length) {
    console.error('No collections registered. Please register at least one collection before benchmarking.');
    return;
  }

  console.log(`Found ${collections.length} registered collections.`);

  // Run benchmarks for each collection
  for (const collection of collections) {
    console.log(`\n----- Benchmarking collection: ${collection.id} (${collection.name}) -----`);

    // Create a shuffled array of chunk sizes to test
    // This prevents bias from system warming up or other sequential effects
    const shuffledChunkSizes = shuffleArray([...CHUNK_SIZES]);

    console.log(`Testing chunk sizes in random order: ${shuffledChunkSizes.join(', ')}`);

    // Results by chunk size
    const resultsByChunkSize: ResultsByChunkSize = {};

    // For each chunk size, run multiple benchmark iterations
    for (const chunkSize of shuffledChunkSizes) {
      console.log(`\n==== Testing chunk size: ${chunkSize} ====`);

      // Track metrics for this chunk size
      const loadingTimes: number[] = [];
      const indexingTimes: number[] = [];
      const searchTimes: number[] = [];
      const totalTimes: number[] = [];

      let resources: any[] = [];
      let searchIndex: any = null;

      for (let run = 1; run <= RUNS_PER_CHUNK_SIZE; run++) {
        console.log(`\nRun ${run}/${RUNS_PER_CHUNK_SIZE}:`);

        // Measure loading
        console.log('1. Measuring resource loading time...');
        const runStart = performance.now();
        const loadStart = performance.now();

        // Get search index with the current chunk size
        const result = await getSearchIndexForCollection(collection, {
          recreateIndex: true,
          chunkSize: chunkSize,
          loadingProgressCallback: (loaded: number, total: number) => {
            // Progress reporting if needed
          },
          indexingProgressCallback: (indexed: number, total: number) => {
            // Progress reporting if needed
          }
        });

        resources = result.resources;
        searchIndex = result.searchIndex;
        const isIndexingComplete = result.isIndexingComplete;

        const loadEnd = performance.now();
        const loadTime = loadEnd - loadStart;
        loadingTimes.push(loadTime);

        console.log(`   - Loaded ${resources.length} resources in ${loadTime.toFixed(2)}ms`);

        // Wait for indexing to complete if it's not already done
        console.log('2. Measuring indexing time...');
        const indexStart = performance.now();

        // If indexing is not complete, wait for it
        if (!isIndexingComplete) {
          console.log('   - Async indexing in progress, waiting for completion...');

          // Poll until indexing is complete
          // Note: MiniSearch doesn't have an isIndexingComplete method directly
          // We rely on the result from getSearchIndexForCollection
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const indexEnd = performance.now();
        const indexTime = indexEnd - indexStart;
        indexingTimes.push(indexTime);

        console.log(`   - Indexed ${resources.length} resources in ${indexTime.toFixed(2)}ms`);

        // Test search performance
        console.log('3. Testing search performance...');
        const runSearchTimes: number[] = [];

        for (const query of TEST_QUERIES) {
          const searchStart = performance.now();
          const results = searchIndex.search(query) as SearchResult[];
          const searchEnd = performance.now();
          const searchTime = searchEnd - searchStart;

          runSearchTimes.push(searchTime);

          console.log(`   - Query "${query}" returned ${results.length} results in ${searchTime.toFixed(2)}ms`);
        }

        // Calculate average search time for this run
        const avgRunSearchTime = runSearchTimes.reduce((sum, time) => sum + time, 0) / runSearchTimes.length;
        searchTimes.push(avgRunSearchTime);

        // Calculate total time for this run
        const runEnd = performance.now();
        const totalTime = runEnd - runStart;
        totalTimes.push(totalTime);

        console.log(`   - Average search time: ${avgRunSearchTime.toFixed(2)}ms`);
        console.log(`   - Total run time: ${totalTime.toFixed(2)}ms`);

        // Allow for a short pause between runs to prevent overheating/throttling
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Calculate averages for this chunk size
      const avgLoadingTime = loadingTimes.reduce((sum, time) => sum + time, 0) / loadingTimes.length;
      const avgIndexingTime = indexingTimes.reduce((sum, time) => sum + time, 0) / indexingTimes.length;
      const avgSearchTime = searchTimes.reduce((sum, time) => sum + time, 0) / searchTimes.length;
      const avgTotalTime = totalTimes.reduce((sum, time) => sum + time, 0) / totalTimes.length;

      // Store results for this chunk size
      resultsByChunkSize[chunkSize] = {
        avgLoadingTime,
        avgIndexingTime,
        avgSearchTime,
        avgTotalTime,
        resourceCount: resources.length
      };

      // Display summary for this chunk size
      console.log(`\nChunk Size ${chunkSize} Summary:`);
      console.log(`Avg. Loading Time: ${avgLoadingTime.toFixed(2)}ms`);
      console.log(`Avg. Indexing Time: ${avgIndexingTime.toFixed(2)}ms`);
      console.log(`Avg. Search Time: ${avgSearchTime.toFixed(2)}ms`);
      console.log(`Avg. Total Time: ${avgTotalTime.toFixed(2)}ms`);
    }

    // Find the best performing chunk size based on total processing time
    const sortedResults = Object.entries(resultsByChunkSize)
      .sort(([, a], [, b]) => a.avgTotalTime - b.avgTotalTime);

    const fastestChunkSize = sortedResults[0][0];
    const fastestResult = sortedResults[0][1];

    // Overall benchmark summary
    console.log('\n=== BENCHMARK SUMMARY ===');
    console.log(`Collection: ${collection.id} (${collection.name})`);
    console.log(`Resource Count: ${fastestResult.resourceCount}`);
    console.log('\nPerformance by Chunk Size (sorted by total time):');

    sortedResults.forEach(([chunkSize, result]) => {
      const isFastest = chunkSize === fastestChunkSize;
      const marker = isFastest ? '🥇 ' : '   ';
      console.log(`${marker}Chunk Size ${chunkSize.padStart(2, ' ')}: ${result.avgTotalTime.toFixed(2)}ms total ` +
                 `(Load: ${result.avgLoadingTime.toFixed(2)}ms, Index: ${result.avgIndexingTime.toFixed(2)}ms)`);
    });

    console.log(`\n👑 Fastest Chunk Size: ${fastestChunkSize}`);
    console.log(`Loading: ${fastestResult.avgLoadingTime.toFixed(2)}ms`);
    console.log(`Indexing: ${fastestResult.avgIndexingTime.toFixed(2)}ms`);
    console.log(`Search: ${fastestResult.avgSearchTime.toFixed(2)}ms`);
    console.log(`Total: ${fastestResult.avgTotalTime.toFixed(2)}ms`);

    // Final system metrics for the fastest configuration
    const memoryUsage = process.memoryUsage();
    console.log('\nMEMORY USAGE:');
    console.log(`RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);

    // Recommendation
    console.log('\nRECOMMENDATION:');
    console.log(`Based on these results, consider setting this environment variable:`);
    console.log(`MCP_INDEXER_CHUNK_SIZE=${fastestChunkSize}`);
  }

  console.log('\n====================================');
  console.log('BENCHMARK COMPLETE');
  console.log('====================================');
}

// Run the benchmark only if this file is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runBenchmark().catch(err => {
    console.error('Benchmark failed:', err);
  });
}
